from datetime import timedelta

from app.core.security import hash_session_token, verify_password
from app.models.user import UserRole, utc_now
from app.models.user_session import UserSession
from conftest import create_test_user


def test_successful_login_sets_cookie_and_stores_hashed_session(client, db_session, settings):
    user = create_test_user(db_session, username="nuam", password="secret-123")

    response = client.post(
        "/api/v1/auth/login",
        json={"username": " NuAm ", "password": "secret-123"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "nuam"
    assert "password_hash" not in response.text
    assert settings.session_cookie_name in response.cookies
    session = db_session.query(UserSession).filter_by(user_id=user.id).one()
    assert session.token_hash != response.cookies[settings.session_cookie_name]
    assert len(session.token_hash) == 64
    db_session.refresh(user)
    assert user.last_login_at is not None


def test_login_rejects_wrong_username_and_password(client, db_session):
    create_test_user(db_session, username="nuam", password="secret-123")

    missing = client.post(
        "/api/v1/auth/login",
        json={"username": "unknown", "password": "secret-123"},
    )
    wrong_password = client.post(
        "/api/v1/auth/login",
        json={"username": "nuam", "password": "wrong-123"},
    )

    assert missing.status_code == 401
    assert wrong_password.status_code == 401
    assert missing.json()["detail"] == wrong_password.json()["detail"]


def test_login_rejects_inactive_user(client, db_session):
    create_test_user(db_session, username="nuam", password="secret-123", is_active=False)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "nuam", "password": "secret-123"},
    )

    assert response.status_code == 401
    assert "deaktiviert" in response.json()["detail"]


def test_me_requires_valid_session(client, db_session, settings):
    user = create_test_user(db_session, username="nuam")
    token = "plain-session-token"
    db_session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=utc_now() + timedelta(hours=1),
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/auth/me",
        cookies={settings.session_cookie_name: token},
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Nuam"


def test_me_rejects_missing_invalid_expired_and_inactive_sessions(client, db_session, settings):
    user = create_test_user(db_session, username="nuam")
    inactive = create_test_user(db_session, username="inactive", is_active=False)
    expired_token = "expired-token"
    inactive_token = "inactive-token"
    db_session.add_all(
        [
            UserSession(
                user_id=user.id,
                token_hash=hash_session_token(expired_token),
                expires_at=utc_now() - timedelta(hours=1),
            ),
            UserSession(
                user_id=inactive.id,
                token_hash=hash_session_token(inactive_token),
                expires_at=utc_now() + timedelta(hours=1),
            ),
        ]
    )
    db_session.commit()

    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get(
        "/api/v1/auth/me",
        cookies={settings.session_cookie_name: "invalid"},
    ).status_code == 401
    assert client.get(
        "/api/v1/auth/me",
        cookies={settings.session_cookie_name: expired_token},
    ).status_code == 401
    assert client.get(
        "/api/v1/auth/me",
        cookies={settings.session_cookie_name: inactive_token},
    ).status_code == 401


def test_logout_deletes_session_and_is_idempotent(client, db_session, settings):
    user = create_test_user(db_session, username="nuam")
    token = "plain-session-token"
    db_session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=utc_now() + timedelta(hours=1),
        )
    )
    db_session.commit()

    response = client.post(
        "/api/v1/auth/logout",
        cookies={settings.session_cookie_name: token},
    )
    second = client.post("/api/v1/auth/logout")

    assert response.status_code == 200
    assert second.status_code == 200
    assert db_session.query(UserSession).count() == 0


def test_change_password_updates_hash_keeps_current_session_and_clears_flag(client, db_session, settings):
    user = create_test_user(
        db_session,
        username="nuam",
        password="old-pass-123",
        must_change_password=True,
    )
    current_token = "current-token"
    other_token = "other-token"
    current_session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(current_token),
        expires_at=utc_now() + timedelta(hours=1),
    )
    other_session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(other_token),
        expires_at=utc_now() + timedelta(hours=1),
    )
    db_session.add_all([current_session, other_session])
    db_session.commit()

    response = client.post(
        "/api/v1/auth/change-password",
        cookies={settings.session_cookie_name: current_token},
        json={
            "current_password": "old-pass-123",
            "new_password": "new-pass-123",
            "new_password_confirmation": "new-pass-123",
        },
    )

    assert response.status_code == 200
    db_session.refresh(user)
    assert user.must_change_password is False
    assert verify_password("new-pass-123", user.password_hash)
    assert db_session.query(UserSession).count() == 1


def test_change_password_rejects_wrong_current_password_and_invalid_confirmation(client, db_session, settings):
    user = create_test_user(db_session, username="nuam", password="old-pass-123")
    token = "current-token"
    db_session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=utc_now() + timedelta(hours=1),
        )
    )
    db_session.commit()

    wrong_current = client.post(
        "/api/v1/auth/change-password",
        cookies={settings.session_cookie_name: token},
        json={
            "current_password": "wrong-pass",
            "new_password": "new-pass-123",
            "new_password_confirmation": "new-pass-123",
        },
    )
    mismatch = client.post(
        "/api/v1/auth/change-password",
        cookies={settings.session_cookie_name: token},
        json={
            "current_password": "old-pass-123",
            "new_password": "new-pass-123",
            "new_password_confirmation": "other-pass-123",
        },
    )

    assert wrong_current.status_code == 400
    assert mismatch.status_code == 400

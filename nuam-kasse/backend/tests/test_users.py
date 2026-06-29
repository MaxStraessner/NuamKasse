from datetime import timedelta

from app.core.security import hash_session_token, verify_password
from app.models.user import UserRole, utc_now
from app.models.user_session import UserSession
from conftest import create_test_user


def login(client, username: str, password: str):
    return client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )


def test_admin_can_list_and_create_users(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")

    create_response = client.post(
        "/api/v1/users",
        json={
            "username": " Nuam ",
            "display_name": "Nuam",
            "password": "temp-pass-123",
            "password_confirmation": "temp-pass-123",
            "role": "member",
        },
    )
    list_response = client.get("/api/v1/users")

    assert create_response.status_code == 201
    assert create_response.json()["must_change_password"] is True
    assert "password_hash" not in create_response.text
    assert list_response.status_code == 200
    assert len(list_response.json()) == 2


def test_member_cannot_use_admin_endpoints(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    login(client, "nuam", "member-pass")

    response = client.get("/api/v1/users")

    assert response.status_code == 403


def test_duplicate_username_is_case_insensitive(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    create_test_user(db_session, username="Nuam", password="member-pass")
    login(client, "admin", "admin-pass")

    response = client.post(
        "/api/v1/users",
        json={
            "username": " nuam ",
            "display_name": "Nuam 2",
            "password": "temp-pass-123",
            "password_confirmation": "temp-pass-123",
            "role": "member",
        },
    )

    assert response.status_code == 400


def test_admin_can_update_role_display_name_and_active_status(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    user = create_test_user(db_session, username="nuam", password="member-pass")
    token = "member-token"
    db_session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=utc_now() + timedelta(hours=1),
        )
    )
    db_session.commit()
    login(client, "admin", "admin-pass")

    response = client.patch(
        f"/api/v1/users/{user.id}",
        json={"display_name": "Nuam Neu", "role": "admin", "is_active": False},
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Nuam Neu"
    assert response.json()["role"] == "admin"
    assert response.json()["is_active"] is False
    assert db_session.query(UserSession).filter_by(user_id=user.id).count() == 0


def test_last_active_admin_cannot_be_disabled_or_demoted(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")

    disable = client.patch(f"/api/v1/users/{admin.id}", json={"is_active": False})
    demote = client.patch(f"/api/v1/users/{admin.id}", json={"role": "member"})

    assert disable.status_code == 400
    assert demote.status_code == 400


def test_admin_can_reset_password_and_clear_sessions(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    user = create_test_user(db_session, username="nuam", password="old-pass-123")
    db_session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token("member-token"),
            expires_at=utc_now() + timedelta(hours=1),
        )
    )
    db_session.commit()
    login(client, "admin", "admin-pass")

    response = client.post(
        f"/api/v1/users/{user.id}/reset-password",
        json={
            "new_password": "temp-pass-123",
            "new_password_confirmation": "temp-pass-123",
        },
    )

    assert response.status_code == 200
    db_session.refresh(user)
    assert user.must_change_password is True
    assert verify_password("temp-pass-123", user.password_hash)
    assert db_session.query(UserSession).filter_by(user_id=user.id).count() == 0
    assert login(client, "nuam", "old-pass-123").status_code == 401
    assert login(client, "nuam", "temp-pass-123").status_code == 200

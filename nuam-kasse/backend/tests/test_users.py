import argparse
from datetime import timedelta

from app.core.security import hash_session_token, verify_password
from app.models.user import UserRole, utc_now
from app.models.user_session import UserSession
from app.scripts import create_admin as create_admin_script
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
    member = create_test_user(
        db_session,
        username="nuam",
        password="member-pass",
        role=UserRole.member,
    )
    login(client, "nuam", "member-pass")

    responses = [
        client.get("/api/v1/users"),
        client.get("/api/v1/users/access-options"),
        client.get("/api/v1/users/audit-log"),
        client.post(
            "/api/v1/users",
            json={
                "username": "blocked",
                "display_name": "Blocked",
                "password": "blocked-pass-123",
                "password_confirmation": "blocked-pass-123",
                "role": "member",
            },
        ),
        client.patch(f"/api/v1/users/{member.id}", json={"role": "admin"}),
        client.post(
            f"/api/v1/users/{member.id}/reset-password",
            json={
                "new_password": "blocked-pass-456",
                "new_password_confirmation": "blocked-pass-456",
            },
        ),
        client.put(
            f"/api/v1/users/{member.id}/access",
            json={"cashbook_accesses": []},
        ),
        client.delete(f"/api/v1/users/{member.id}"),
    ]

    assert {response.status_code for response in responses} == {403}


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
        json={"username": "nurm-neu", "display_name": "Nuam Neu", "role": "admin", "is_active": False},
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Nuam Neu"
    assert response.json()["username"] == "nurm-neu"
    assert response.json()["role"] == "admin"
    assert response.json()["is_active"] is False
    assert db_session.query(UserSession).filter_by(user_id=user.id).count() == 0

    reactivate = client.patch(f"/api/v1/users/{user.id}", json={"is_active": True})
    assert reactivate.status_code == 200
    assert reactivate.json()["is_active"] is True

    audit = client.get(f"/api/v1/users/audit-log?target_user_id={user.id}")
    assert audit.status_code == 200
    assert {event["action"] for event in audit.json()} >= {
        "user.username_changed",
        "user.display_name_changed",
        "user.role_changed",
        "user.deactivated",
        "user.activated",
    }


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

    login(client, "admin", "admin-pass")
    audit = client.get(f"/api/v1/users/audit-log?target_user_id={user.id}")
    assert audit.status_code == 200
    reset_event = next(
        event for event in audit.json() if event["action"] == "user.password_reset"
    )
    assert "temp-pass-123" not in str(reset_event)
    assert "old-pass-123" not in str(reset_event)


def test_create_admin_prints_generated_password_after_session_closes(monkeypatch, capsys):
    class FakeSession:
        closed = False

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.closed = True

    class FakeUser:
        @property
        def username(self):
            if session.closed:
                raise RuntimeError("detached")
            return "Max"

    session = FakeSession()
    user = FakeUser()
    monkeypatch.setattr(create_admin_script, "SessionLocal", lambda: session)
    monkeypatch.setattr(
        create_admin_script,
        "_arguments",
        lambda: argparse.Namespace(
            username="Max",
            display_name=None,
            promote_existing=True,
            reset_password=True,
            generate_password=True,
        ),
    )
    monkeypatch.setattr(create_admin_script, "_password", lambda _args: "generated-test-pass")
    monkeypatch.setattr(
        create_admin_script,
        "get_user_by_normalized_username",
        lambda _db, _username: user,
    )
    monkeypatch.setattr(create_admin_script, "update_user", lambda *_args, **_kwargs: user)
    monkeypatch.setattr(create_admin_script, "reset_user_password", lambda *_args, **_kwargs: None)

    create_admin_script.main()

    output = capsys.readouterr().out
    assert "Administrator 'Max' wurde hochgestuft." in output
    assert output.count("generated-test-pass") == 1

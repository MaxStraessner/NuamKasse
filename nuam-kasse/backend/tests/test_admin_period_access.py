from datetime import date, timedelta
from decimal import Decimal

from app.models import (
    Cashbook,
    CashbookMembership,
    CashPeriod,
    CashPeriodPermission,
    CashPeriodStatus,
    PeriodAccessMode,
    UserRole,
)
from conftest import create_test_user, get_test_cashbook


def login(client, username: str, password: str = "password-123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def create_period(db, *, cashbook_id: int, user_id: int, name: str, start: date, active: bool):
    period = CashPeriod(
        cashbook_id=cashbook_id,
        name=name,
        opening_amount=Decimal("1000.00"),
        currency="THB",
        start_date=start,
        end_date=None if active else start + timedelta(days=27),
        status=CashPeriodStatus.active if active else CashPeriodStatus.closed,
        created_by_user_id=user_id,
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


def test_admin_can_create_user_with_selected_period_access_and_audit(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    cashbook = get_test_cashbook(db_session)
    august = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="August 2026",
        start=date(2026, 8, 1),
        active=False,
    )

    login(client, "admin")
    response = client.post(
        "/api/v1/users",
        json={
            "username": "Nurm",
            "display_name": "Nurm",
            "password": "temp-pass-123",
            "password_confirmation": "temp-pass-123",
            "role": "member",
            "is_active": True,
            "cashbook_accesses": [
                {
                    "cashbook_id": cashbook.id,
                    "period_access_mode": "selected",
                    "period_ids": [august.id],
                }
            ],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["cashbook_count"] == 1
    assert payload["cashbook_accesses"][0]["accessible_period_ids"] == [august.id]
    assert "password_hash" not in response.text
    assert "temp-pass-123" not in response.text

    audit = client.get(f"/api/v1/users/audit-log?target_user_id={payload['id']}")
    assert audit.status_code == 200
    assert audit.json()[0]["action"] == "user.created"
    assert {event["action"] for event in audit.json()} >= {
        "user.created",
        "user.cashbook_access_changed",
        "user.period_access_changed",
    }
    assert "password_hash" not in audit.text
    assert "temp-pass-123" not in audit.text


def test_selected_period_is_allowed_and_other_period_is_denied(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nurm", role=UserRole.member)
    cashbook = get_test_cashbook(db_session)
    august = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="August 2026",
        start=date(2026, 8, 1),
        active=False,
    )
    september = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="September 2026",
        start=date(2026, 9, 1),
        active=True,
    )
    membership = db_session.query(CashbookMembership).filter_by(
        cashbook_id=cashbook.id, user_id=member.id
    ).one()
    membership.period_access_mode = PeriodAccessMode.selected
    db_session.add(
        CashPeriodPermission(
            membership_id=membership.id,
            cash_period_id=september.id,
            created_by_user_id=admin.id,
        )
    )
    db_session.commit()

    login(client, "nurm")
    allowed = client.get(f"/api/v1/cash-periods/{september.id}")
    denied = client.get(f"/api/v1/cash-periods/{august.id}")
    listed = client.get("/api/v1/cash-periods")

    assert allowed.status_code == 200
    assert denied.status_code == 403
    assert [period["id"] for period in listed.json()] == [september.id]

    admin_membership = db_session.query(CashbookMembership).filter_by(
        cashbook_id=cashbook.id,
        user_id=admin.id,
    ).one()
    admin_membership.period_access_mode = PeriodAccessMode.selected
    db_session.add(
        CashPeriodPermission(
            membership_id=admin_membership.id,
            cash_period_id=august.id,
            created_by_user_id=admin.id,
        )
    )
    db_session.commit()
    login(client, "admin")
    close_denied = client.post(
        f"/api/v1/cash-periods/{september.id}/close",
        json={"end_date": "2026-09-30"},
    )
    assert close_denied.status_code == 403


def test_current_and_future_mode_keeps_current_and_grants_new_period(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nurm", role=UserRole.member)
    cashbook = get_test_cashbook(db_session)
    august = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="August 2026",
        start=date(2026, 8, 1),
        active=False,
    )
    september = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="September 2026",
        start=date(2026, 9, 1),
        active=True,
    )
    membership = db_session.query(CashbookMembership).filter_by(
        cashbook_id=cashbook.id, user_id=member.id
    ).one()
    membership.period_access_mode = PeriodAccessMode.current_and_future
    membership.period_access_from = september.start_date
    db_session.commit()

    login(client, "nurm")
    assert client.get(f"/api/v1/cash-periods/{august.id}").status_code == 403
    assert client.get(f"/api/v1/cash-periods/{september.id}").status_code == 200

    september.status = CashPeriodStatus.closed
    september.end_date = date(2026, 9, 30)
    october = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="Oktober 2026",
        start=date(2026, 10, 1),
        active=True,
    )
    assert client.get(f"/api/v1/cash-periods/{october.id}").status_code == 200


def test_period_assignment_requires_matching_cashbook(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nurm", role=UserRole.member)
    first_cashbook = get_test_cashbook(db_session)
    other_cashbook = Cashbook(
        name="Haushalt",
        currency="THB",
        created_by_user_id=admin.id,
        category_owner_user_id=admin.id,
    )
    db_session.add(other_cashbook)
    db_session.flush()
    other_period = create_period(
        db_session,
        cashbook_id=other_cashbook.id,
        user_id=admin.id,
        name="September 2026",
        start=date(2026, 9, 1),
        active=True,
    )

    login(client, "admin")
    response = client.put(
        f"/api/v1/users/{member.id}/access",
        json={
            "cashbook_accesses": [
                {
                    "cashbook_id": first_cashbook.id,
                    "period_access_mode": "selected",
                    "period_ids": [other_period.id],
                }
            ]
        },
    )

    assert response.status_code == 400


def test_global_admin_without_cashbook_admin_role_can_use_user_administration(client, db_session):
    owner = create_test_user(db_session, username="owner", role=UserRole.admin)
    global_admin = create_test_user(db_session, username="global", role=UserRole.admin)
    membership = db_session.query(CashbookMembership).filter_by(user_id=global_admin.id).one()
    assert membership.role.value == "member"

    login(client, "global")
    response = client.get("/api/v1/users")

    assert response.status_code == 200
    assert {user["username"] for user in response.json()} == {"owner", "global"}


def test_cashbook_admin_role_can_be_transferred_before_deactivation(client, db_session):
    owner = create_test_user(db_session, username="owner", role=UserRole.admin)
    replacement = create_test_user(db_session, username="replacement", role=UserRole.admin)
    cashbook = get_test_cashbook(db_session)

    login(client, "replacement")
    blocked = client.patch(f"/api/v1/users/{owner.id}", json={"is_active": False})
    assert blocked.status_code == 400

    promoted = client.put(
        f"/api/v1/users/{replacement.id}/access",
        json={
            "cashbook_accesses": [
                {
                    "cashbook_id": cashbook.id,
                    "cashbook_role": "admin",
                    "period_access_mode": "all",
                    "period_ids": [],
                }
            ]
        },
    )
    assert promoted.status_code == 200
    assert promoted.json()["cashbook_accesses"][0]["cashbook_role"] == "admin"

    deactivated = client.patch(f"/api/v1/users/{owner.id}", json={"is_active": False})
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False


def test_member_without_cashbook_access_is_denied_and_period_cannot_be_granted_alone(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nurm", role=UserRole.member)
    cashbook = get_test_cashbook(db_session)
    period = create_period(
        db_session,
        cashbook_id=cashbook.id,
        user_id=admin.id,
        name="September 2026",
        start=date(2026, 9, 1),
        active=True,
    )
    membership = db_session.query(CashbookMembership).filter_by(user_id=member.id).one()
    db_session.delete(membership)
    db_session.commit()

    login(client, "nurm")
    assert client.get(f"/api/v1/cash-periods/{period.id}").status_code == 403


def test_user_deletion_is_refused_to_preserve_history(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    login(client, "admin")

    response = client.delete(f"/api/v1/users/{admin.id}")

    assert response.status_code == 409
    assert db_session.get(type(admin), admin.id) is not None

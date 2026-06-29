from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.user import UserRole
from conftest import create_test_user


def login(client, username: str, password: str):
    return client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )


def create_test_cash_period(
    db_session,
    *,
    name: str = "Juli 2026",
    opening_amount: Decimal = Decimal("20000.00"),
    status: CashPeriodStatus = CashPeriodStatus.active,
    start_date: date = date(2026, 7, 1),
    end_date: date | None = None,
    created_by_user_id: int,
) -> CashPeriod:
    cash_period = CashPeriod(
        name=name,
        opening_amount=opening_amount,
        currency="THB",
        start_date=start_date,
        end_date=end_date,
        status=status,
        created_by_user_id=created_by_user_id,
    )
    db_session.add(cash_period)
    db_session.commit()
    db_session.refresh(cash_period)
    return cash_period


def test_member_and_admin_can_read_active_cash_period(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)

    login(client, "nuam", "member-pass")
    member_response = client.get("/api/v1/cash-periods/current")
    login(client, "admin", "admin-pass")
    admin_response = client.get("/api/v1/cash-periods/current")

    assert member_response.status_code == 200
    assert admin_response.status_code == 200
    assert member_response.json()["id"] == cash_period.id
    assert member_response.json()["opening_amount"] == "20000.00"
    assert member_response.json()["created_by"]["display_name"] == "Admin"


def test_current_cash_period_requires_login_completed_password_and_active_user(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    create_test_cash_period(db_session, created_by_user_id=admin.id)
    create_test_user(
        db_session,
        username="nuam",
        password="member-pass",
        must_change_password=True,
    )

    missing = client.get("/api/v1/cash-periods/current")
    login(client, "nuam", "member-pass")
    forced_change = client.get("/api/v1/cash-periods/current")

    assert missing.status_code == 401
    assert forced_change.status_code == 403


def test_missing_active_cash_period_returns_structured_404(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass")
    login(client, "nuam", "member-pass")

    response = client.get("/api/v1/cash-periods/current")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "no_active_cash_period"


def test_current_summary_uses_opening_amount_without_fake_bookings(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    create_test_cash_period(
        db_session,
        opening_amount=Decimal("12345.67"),
        created_by_user_id=admin.id,
    )
    login(client, "admin", "admin-pass")

    response = client.get("/api/v1/cash-periods/current/summary")

    assert response.status_code == 200
    assert response.json()["opening_amount"] == "12345.67"
    assert response.json()["spent_amount"] == "0.00"
    assert response.json()["remaining_amount"] == "12345.67"
    assert response.json()["currency"] == "THB"


def test_admin_can_create_cash_period_and_member_cannot(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)

    login(client, "nuam", "member-pass")
    member_response = client.post(
        "/api/v1/cash-periods",
        json={
            "name": "Juli 2026",
            "opening_amount": "20000.00",
            "currency": "THB",
            "start_date": "2026-07-01",
        },
    )
    login(client, "admin", "admin-pass")
    admin_response = client.post(
        "/api/v1/cash-periods",
        json={
            "name": " Juli 2026 ",
            "opening_amount": "20000",
            "currency": "THB",
            "start_date": "2026-07-01",
        },
    )

    assert member_response.status_code == 403
    assert admin_response.status_code == 201
    assert admin_response.json()["name"] == "Juli 2026"
    assert admin_response.json()["opening_amount"] == "20000.00"
    assert admin_response.json()["status"] == "active"
    assert admin_response.json()["created_by"]["display_name"] == "Admin"
    assert isinstance(db_session.get(CashPeriod, admin_response.json()["id"]).opening_amount, Decimal)


def test_create_cash_period_validates_money_currency_dates_and_active_conflict(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")

    bad_amounts = ["0", "-1.00", "10.123", "1000000000.00"]
    for amount in bad_amounts:
        response = client.post(
            "/api/v1/cash-periods",
            json={
                "name": "Juli 2026",
                "opening_amount": amount,
                "currency": "THB",
                "start_date": "2026-07-01",
            },
        )
        assert response.status_code == 400

    bad_currency = client.post(
        "/api/v1/cash-periods",
        json={
            "name": "Juli 2026",
            "opening_amount": "20000.00",
            "currency": "EUR",
            "start_date": "2026-07-01",
        },
    )
    bad_dates = client.post(
        "/api/v1/cash-periods",
        json={
            "name": "Juli 2026",
            "opening_amount": "20000.00",
            "currency": "THB",
            "start_date": "2026-07-01",
            "end_date": "2026-06-30",
        },
    )
    created = client.post(
        "/api/v1/cash-periods",
        json={
            "name": "Juli 2026",
            "opening_amount": "20000.00",
            "currency": "THB",
            "start_date": "2026-07-01",
        },
    )
    conflict = client.post(
        "/api/v1/cash-periods",
        json={
            "name": "August 2026",
            "opening_amount": "21000.00",
            "currency": "THB",
            "start_date": "2026-08-01",
        },
    )

    assert bad_currency.status_code == 400
    assert bad_dates.status_code == 400
    assert created.status_code == 201
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "active_cash_period_exists"
    assert db_session.get(CashPeriod, created.json()["id"]).created_by_user_id == admin.id


def test_admin_can_list_filter_and_read_history(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    create_test_cash_period(
        db_session,
        name="Juni 2026",
        status=CashPeriodStatus.closed,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 30),
        created_by_user_id=admin.id,
    )
    active = create_test_cash_period(
        db_session,
        name="Juli 2026",
        status=CashPeriodStatus.active,
        start_date=date(2026, 7, 1),
        created_by_user_id=admin.id,
    )
    login(client, "admin", "admin-pass")

    all_periods = client.get("/api/v1/cash-periods")
    closed = client.get("/api/v1/cash-periods?status=closed")
    single = client.get(f"/api/v1/cash-periods/{active.id}")
    invalid = client.get("/api/v1/cash-periods?status=invalid")

    assert all_periods.status_code == 200
    assert [item["name"] for item in all_periods.json()] == ["Juli 2026", "Juni 2026"]
    assert closed.status_code == 200
    assert [item["status"] for item in closed.json()] == ["closed"]
    assert single.status_code == 200
    assert invalid.status_code == 422


def test_member_cannot_list_or_read_history(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    login(client, "nuam", "member-pass")

    list_response = client.get("/api/v1/cash-periods")
    read_response = client.get(f"/api/v1/cash-periods/{cash_period.id}")

    assert list_response.status_code == 403
    assert read_response.status_code == 403


def test_admin_can_update_active_cash_period(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    login(client, "admin", "admin-pass")

    response = client.patch(
        f"/api/v1/cash-periods/{cash_period.id}",
        json={
            "name": "Juli korrigiert",
            "opening_amount": "25000.50",
            "start_date": "2026-07-02",
            "end_date": "2026-07-31",
        },
    )
    forbidden_fields = client.patch(
        f"/api/v1/cash-periods/{cash_period.id}",
        json={"status": "closed", "currency": "EUR"},
    )
    missing = client.patch("/api/v1/cash-periods/9999", json={"name": "Fehlt"})

    assert response.status_code == 200
    assert response.json()["name"] == "Juli korrigiert"
    assert response.json()["opening_amount"] == "25000.50"
    assert response.json()["start_date"] == "2026-07-02"
    assert response.json()["end_date"] == "2026-07-31"
    assert forbidden_fields.status_code == 422
    assert missing.status_code == 404


def test_admin_can_clear_optional_end_date_on_active_cash_period(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    cash_period = create_test_cash_period(
        db_session,
        end_date=date(2026, 7, 31),
        created_by_user_id=admin.id,
    )
    login(client, "admin", "admin-pass")

    response = client.patch(
        f"/api/v1/cash-periods/{cash_period.id}",
        json={"end_date": None},
    )

    assert response.status_code == 200
    assert response.json()["end_date"] is None


def test_closed_cash_period_cannot_be_updated_or_closed_again(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    cash_period = create_test_cash_period(
        db_session,
        status=CashPeriodStatus.closed,
        end_date=date(2026, 7, 31),
        created_by_user_id=admin.id,
    )
    login(client, "admin", "admin-pass")

    update = client.patch(f"/api/v1/cash-periods/{cash_period.id}", json={"name": "Neu"})
    close = client.post(f"/api/v1/cash-periods/{cash_period.id}/close", json={})

    assert update.status_code == 409
    assert update.json()["detail"]["code"] == "cash_period_closed"
    assert close.status_code == 409


def test_admin_can_close_cash_period_and_create_next_one(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    login(client, "admin", "admin-pass")

    close = client.post(
        f"/api/v1/cash-periods/{cash_period.id}/close",
        json={"end_date": "2026-07-31"},
    )
    current = client.get("/api/v1/cash-periods/current")
    next_period = client.post(
        "/api/v1/cash-periods",
        json={
            "name": "August 2026",
            "opening_amount": "21000.00",
            "currency": "THB",
            "start_date": "2026-08-01",
        },
    )

    assert close.status_code == 200
    assert close.json()["status"] == "closed"
    assert close.json()["end_date"] == "2026-07-31"
    assert close.json()["closed_at"] is not None
    assert close.json()["closed_by"]["display_name"] == "Admin"
    assert current.status_code == 404
    assert next_period.status_code == 201


def test_close_rejects_end_date_before_start_and_member(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    login(client, "nuam", "member-pass")

    member = client.post(f"/api/v1/cash-periods/{cash_period.id}/close", json={})
    login(client, "admin", "password-123")
    bad_date = client.post(
        f"/api/v1/cash-periods/{cash_period.id}/close",
        json={"end_date": "2026-06-30"},
    )

    assert member.status_code == 403
    assert bad_date.status_code == 400


def test_database_prevents_two_active_cash_periods(db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    create_test_cash_period(db_session, name="Juli 2026", created_by_user_id=admin.id)
    db_session.add(
        CashPeriod(
            name="August 2026",
            opening_amount=Decimal("21000.00"),
            currency="THB",
            start_date=date(2026, 8, 1),
            status=CashPeriodStatus.active,
            created_by_user_id=admin.id,
        )
    )

    with pytest.raises(IntegrityError):
        db_session.commit()

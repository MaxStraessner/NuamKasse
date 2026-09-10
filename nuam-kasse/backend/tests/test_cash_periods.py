from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.category import Category, CategoryType
from app.models.expense import Expense
from app.models.user import UserRole, utc_now
from conftest import create_test_user, get_test_cashbook


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
        cashbook_id=get_test_cashbook(db_session).id,
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


def test_member_can_list_and_read_shared_history(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    login(client, "nuam", "member-pass")

    list_response = client.get("/api/v1/cash-periods")
    read_response = client.get(f"/api/v1/cash-periods/{cash_period.id}")

    assert list_response.status_code == 200
    assert read_response.status_code == 200
    assert read_response.json()["id"] == cash_period.id


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


def test_admin_can_close_cash_period_then_start_next_one(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    cash_period = create_test_cash_period(db_session, created_by_user_id=admin.id)
    category = Category(
        cashbook_id=get_test_cashbook(db_session).id,
        user_id=admin.id,
        name="Essen",
        name_normalized="essen",
        icon_key="utensils",
        color_key="orange",
        category_type=CategoryType.expense,
        sort_order=1,
        is_active=True,
    )
    db_session.add(category)
    db_session.flush()
    db_session.add(
        Expense(
            cash_period_id=cash_period.id,
            category_id=category.id,
            amount=Decimal("125.50"),
            transaction_type=CategoryType.expense,
            currency="THB",
            created_by_user_id=admin.id,
        )
    )
    db_session.commit()
    login(client, "admin", "admin-pass")

    close = client.post(
        f"/api/v1/cash-periods/{cash_period.id}/close",
        json={"end_date": "2026-07-31"},
    )
    current_after_close = client.get("/api/v1/cash-periods/current")
    assert close.status_code == 200
    assert close.json()["closed_period"]["status"] == "closed"
    assert close.json()["closed_period"]["end_date"] == "2026-07-31"
    assert close.json()["closed_period"]["closed_at"] is not None
    assert close.json()["closed_period"]["closed_by"]["display_name"] == "Admin"
    assert close.json()["summary"]["remaining_amount"] == "19874.50"
    assert close.json()["closed_period"]["closed_opening_amount"] == "20000.00"
    assert close.json()["closed_period"]["closed_expense_amount"] == "125.50"
    assert close.json()["closed_period"]["closed_balance_amount"] == "19874.50"
    assert close.json()["closed_period"]["closed_booking_count"] == 1
    assert current_after_close.status_code == 404

    started = client.post("/api/v1/cash-periods/start", json={})
    current = client.get("/api/v1/cash-periods/current")
    assert started.status_code == 201
    assert started.json()["status"] == "active"
    assert started.json()["opening_amount"] == "19874.50"
    assert current.status_code == 200
    assert current.json()["id"] == started.json()["id"]
    assert db_session.query(Expense).filter_by(cash_period_id=started.json()["id"]).count() == 0
    assert db_session.query(Expense).filter_by(cash_period_id=cash_period.id).count() == 1
    assert db_session.get(Category, category.id).name == "Essen"
    active_count = db_session.scalar(
        select(func.count(CashPeriod.id)).where(CashPeriod.status == CashPeriodStatus.active)
    )
    assert active_count == 1


def test_categories_and_home_configuration_survive_three_period_transitions(
    client,
    db_session,
    settings: Settings,
):
    admin = create_test_user(
        db_session,
        username="admin",
        password="admin-pass",
        role=UserRole.admin,
    )
    cashbook = get_test_cashbook(db_session)
    first_period = create_test_cash_period(
        db_session,
        name="Mai 2026",
        start_date=date(2026, 5, 1),
        created_by_user_id=admin.id,
    )
    income = Category(
        cashbook_id=cashbook.id,
        user_id=cashbook.category_owner_user_id,
        name="Einnahmen individuell",
        name_normalized="einnahmen individuell",
        icon_key="wallet",
        color_key="green",
        category_type=CategoryType.income,
        sort_order=1,
        is_active=True,
    )
    expense = Category(
        cashbook_id=cashbook.id,
        user_id=cashbook.category_owner_user_id,
        name="Ernährung individuell",
        name_normalized="ernährung individuell",
        icon_key="utensils",
        color_key="orange",
        category_type=CategoryType.expense,
        sort_order=2,
        is_active=True,
    )
    db_session.add_all([income, expense])
    db_session.flush()
    child = Category(
        cashbook_id=cashbook.id,
        user_id=cashbook.category_owner_user_id,
        name="Markt individuell",
        name_normalized="markt individuell",
        icon_key="shopping-cart",
        color_key="orange",
        category_type=CategoryType.expense,
        parent_category_id=expense.id,
        sort_order=7,
        is_active=True,
    )
    db_session.add(child)
    db_session.flush()

    image_directory = Path(settings.category_image_storage_path) / str(admin.id) / str(expense.id)
    image_directory.mkdir(parents=True, exist_ok=True)
    original_path = image_directory / "preserved.original.png"
    preview_path = image_directory / "preserved.preview.webp"
    original_bytes = b"stable-original-image"
    preview_bytes = b"stable-preview-image"
    original_path.write_bytes(original_bytes)
    preview_path.write_bytes(preview_bytes)
    expense.image_path = original_path.relative_to(settings.category_image_storage_path).as_posix()
    expense.image_preview_path = preview_path.relative_to(settings.category_image_storage_path).as_posix()
    expense.image_original_name = "individuell.png"
    expense.image_mime_type = "image/png"
    expense.image_size = len(original_bytes)
    expense.image_width = 120
    expense.image_height = 80
    expense.image_updated_at = utc_now()
    historical_expense = Expense(
        cash_period_id=first_period.id,
        category_id=child.id,
        amount=Decimal("125.50"),
        transaction_type=CategoryType.expense,
        currency="THB",
        created_by_user_id=admin.id,
    )
    db_session.add(historical_expense)
    db_session.commit()
    login(client, "admin", "admin-pass")

    def category_snapshot() -> list[tuple[object, ...]]:
        return [
            (
                category.id,
                category.cashbook_id,
                category.user_id,
                category.name,
                category.name_normalized,
                category.icon_key,
                category.color_key,
                category.category_type,
                category.parent_category_id,
                category.sort_order,
                category.is_active,
                category.archived_at,
                category.image_path,
                category.image_preview_path,
                category.image_original_name,
                category.image_mime_type,
                category.image_size,
                category.image_width,
                category.image_height,
                category.image_updated_at,
            )
            for category in db_session.scalars(select(Category).order_by(Category.id.asc()))
        ]

    before_snapshot = category_snapshot()
    before_categories = client.get("/api/v1/categories")
    before_image = client.get(f"/api/v1/categories/{expense.id}/image")
    assert before_categories.status_code == 200
    assert before_image.status_code == 200
    before_home_configuration = [
        (
            item["id"],
            item["parent_category_id"],
            item["sort_order"],
            item["category_type"],
            item["image_url"],
        )
        for item in before_categories.json()
    ]

    transitions = (
        (date(2026, 5, 31), date(2026, 6, 1), "Juni 2026"),
        (date(2026, 6, 30), date(2026, 7, 1), "Juli 2026"),
        (date(2026, 7, 31), date(2026, 8, 1), "August 2026"),
    )
    try:
        for end_date, start_date, name in transitions:
            active_period = db_session.scalar(
                select(CashPeriod).where(CashPeriod.status == CashPeriodStatus.active)
            )
            assert active_period is not None
            closed = client.post(
                f"/api/v1/cash-periods/{active_period.id}/close",
                json={"end_date": end_date.isoformat()},
            )
            started = client.post(
                "/api/v1/cash-periods/start",
                json={"name": name, "start_date": start_date.isoformat()},
            )
            categories_after_transition = client.get("/api/v1/categories")
            image_after_transition = client.get(f"/api/v1/categories/{expense.id}/image")

            assert closed.status_code == 200
            assert started.status_code == 201
            assert categories_after_transition.status_code == 200
            assert category_snapshot() == before_snapshot
            assert [
                (
                    item["id"],
                    item["parent_category_id"],
                    item["sort_order"],
                    item["category_type"],
                    item["image_url"],
                )
                for item in categories_after_transition.json()
            ] == before_home_configuration
            assert image_after_transition.status_code == 200
            assert image_after_transition.content == preview_bytes

        category_ids = [item[0] for item in category_snapshot()]
        assert category_ids == [item[0] for item in before_snapshot]
        assert len(category_ids) == len(set(category_ids))
        assert db_session.get(Category, child.id).parent_category_id == expense.id
        assert db_session.get(Category, income.id).category_type == CategoryType.income
        preserved_expense = db_session.get(Expense, historical_expense.id)
        assert preserved_expense is not None
        assert preserved_expense.cash_period_id == first_period.id
        assert preserved_expense.category_id == child.id
        assert db_session.query(CashPeriod).count() == 4
        assert db_session.query(Category).count() == len(before_snapshot)
    finally:
        original_path.unlink(missing_ok=True)
        preview_path.unlink(missing_ok=True)
        for directory in (image_directory, image_directory.parent):
            try:
                directory.rmdir()
            except OSError:
                pass


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
    future_date = client.post(
        f"/api/v1/cash-periods/{cash_period.id}/close",
        json={"end_date": "2999-01-01"},
    )

    assert member.status_code == 403
    assert bad_date.status_code == 400
    assert future_date.status_code == 400


def test_database_prevents_two_active_cash_periods(db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    create_test_cash_period(db_session, name="Juli 2026", created_by_user_id=admin.id)
    db_session.add(
        CashPeriod(
            cashbook_id=get_test_cashbook(db_session).id,
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

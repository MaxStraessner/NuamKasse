from datetime import date, datetime, timezone
from decimal import Decimal

from app.models import CashPeriod, Category, Expense, UserRole
from app.models.cash_period import CashPeriodStatus
from app.models.user import User
from tests.conftest import create_test_user


def login(client, username: str, password: str = "password-123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def create_cash_period(
    db,
    *,
    created_by_user_id: int,
    name: str = "Juli 2026",
    status: CashPeriodStatus = CashPeriodStatus.active,
    opening_amount: Decimal = Decimal("1000.00"),
) -> CashPeriod:
    cash_period = CashPeriod(
        name=name,
        opening_amount=opening_amount,
        currency="THB",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31) if status == CashPeriodStatus.closed else None,
        status=status,
        created_by_user_id=created_by_user_id,
        closed_by_user_id=created_by_user_id if status == CashPeriodStatus.closed else None,
        closed_at=datetime(2026, 7, 31, 12, 0, tzinfo=timezone.utc)
        if status == CashPeriodStatus.closed
        else None,
    )
    db.add(cash_period)
    db.commit()
    db.refresh(cash_period)
    return cash_period


def create_category(
    db,
    *,
    name: str,
    sort_order: int,
    user_id: int,
    icon_key: str = "utensils",
    color_key: str = "orange",
    is_active: bool = True,
    parent_category_id: int | None = None,
) -> Category:
    category = Category(
        user_id=user_id,
        name=name,
        name_normalized=name.casefold(),
        icon_key=icon_key,
        color_key=color_key,
        parent_category_id=parent_category_id,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def create_expense(
    db,
    *,
    cash_period_id: int,
    category_id: int,
    created_by_user_id: int,
    amount: Decimal,
    created_at: datetime,
    is_voided: bool = False,
    voided_by_user_id: int | None = None,
) -> Expense:
    expense = Expense(
        cash_period_id=cash_period_id,
        category_id=category_id,
        amount=amount,
        currency="THB",
        created_by_user_id=created_by_user_id,
        created_at=created_at,
        is_voided=is_voided,
        voided_at=datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc) if is_voided else None,
        voided_by_user_id=voided_by_user_id,
        void_reason="Doppelt" if is_voided else None,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def seed_overview_data(db):
    admin = create_test_user(db, username="admin", role=UserRole.admin)
    member = create_test_user(db, username="nuam", role=UserRole.member)
    other = create_test_user(db, username="nok", role=UserRole.member)
    other.is_active = False
    db.commit()
    cash_period = create_cash_period(db, created_by_user_id=admin.id)
    food = create_category(db, name="Essen", sort_order=1, user_id=member.id)
    bank = create_category(db, name="Bank", sort_order=2, icon_key="landmark", color_key="blue", is_active=False, user_id=other.id)
    unused = create_category(db, name="Leer", sort_order=3, user_id=member.id)
    first = create_expense(
        db,
        cash_period_id=cash_period.id,
        category_id=food.id,
        created_by_user_id=member.id,
        amount=Decimal("250.00"),
        created_at=datetime(2026, 7, 2, 8, 0, tzinfo=timezone.utc),
    )
    second = create_expense(
        db,
        cash_period_id=cash_period.id,
        category_id=bank.id,
        created_by_user_id=other.id,
        amount=Decimal("150.00"),
        created_at=datetime(2026, 7, 3, 8, 0, tzinfo=timezone.utc),
    )
    voided = create_expense(
        db,
        cash_period_id=cash_period.id,
        category_id=food.id,
        created_by_user_id=member.id,
        amount=Decimal("80.00"),
        created_at=datetime(2026, 7, 4, 8, 0, tzinfo=timezone.utc),
        is_voided=True,
        voided_by_user_id=admin.id,
    )
    return admin, member, other, cash_period, food, bank, unused, first, second, voided


def test_current_overview_aggregates_active_period_and_hides_voided_for_member(client, db_session):
    _, member, other, cash_period, food, bank, unused, _, second, _ = seed_overview_data(db_session)

    login(client, "nuam")
    response = client.get("/api/v1/overview/current")

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["cash_period"]["id"] == cash_period.id
    assert data["summary"]["opening_amount"] == "1000.00"
    assert data["summary"]["spent_amount"] == "400.00"
    assert data["summary"]["remaining_amount"] == "600.00"
    assert data["summary"]["expense_count"] == 3
    assert data["summary"]["active_expense_count"] == 2
    assert data["summary"]["voided_expense_count"] == 1
    assert data["categories"] == [
        {
            "category_id": food.id,
            "category_name": "Essen",
            "icon_key": "utensils",
            "color_key": "orange",
            "image_updated_at": None,
            "expense_count": 1,
            "total_amount": "250.00",
            "percentage_of_spending": "62.50",
            "has_custom_image": False,
            "image_url": None,
        },
        {
            "category_id": bank.id,
            "category_name": "Bank",
            "icon_key": "landmark",
            "color_key": "blue",
            "image_updated_at": None,
            "expense_count": 1,
            "total_amount": "150.00",
            "percentage_of_spending": "37.50",
            "has_custom_image": False,
            "image_url": None,
        },
    ]
    assert unused.id not in [item["category_id"] for item in data["categories"]]
    assert data["users"] == [
        {
            "user_id": member.id,
            "display_name": "Nuam",
            "expense_count": 1,
            "total_amount": "250.00",
            "percentage_of_spending": "62.50",
        },
        {
            "user_id": other.id,
            "display_name": "Nok",
            "expense_count": 1,
            "total_amount": "150.00",
            "percentage_of_spending": "37.50",
        },
    ]
    assert [item["id"] for item in data["recent_expenses"]] == [second.id, 1]
    assert "username" not in response.text
    assert "password" not in response.text
    assert "Doppelt" not in response.text


def test_overview_aggregates_and_filters_root_category_with_subcategories(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    cash_period = create_cash_period(db_session, created_by_user_id=admin.id, opening_amount=Decimal("1000.00"))
    health = create_category(
        db_session,
        name="Gesundheit",
        sort_order=1,
        user_id=member.id,
        icon_key="heart-pulse",
        color_key="red",
    )
    pharmacy = create_category(
        db_session,
        name="Apotheke",
        sort_order=1,
        user_id=member.id,
        icon_key="pill",
        color_key="red",
        parent_category_id=health.id,
    )
    create_expense(
        db_session,
        cash_period_id=cash_period.id,
        category_id=health.id,
        created_by_user_id=member.id,
        amount=Decimal("40.00"),
        created_at=datetime(2026, 7, 2, 8, 0, tzinfo=timezone.utc),
    )
    child_expense = create_expense(
        db_session,
        cash_period_id=cash_period.id,
        category_id=pharmacy.id,
        created_by_user_id=member.id,
        amount=Decimal("60.00"),
        created_at=datetime(2026, 7, 3, 8, 0, tzinfo=timezone.utc),
    )
    login(client, "nuam")

    overview = client.get("/api/v1/overview/current")
    filtered_root = client.get(f"/api/v1/overview/cash-periods/{cash_period.id}/expenses?category_id={health.id}")
    filtered_child = client.get(f"/api/v1/overview/cash-periods/{cash_period.id}/expenses?category_id={pharmacy.id}")

    assert overview.status_code == 200
    assert overview.json()["categories"] == [
        {
            "category_id": health.id,
            "category_name": "Gesundheit",
            "icon_key": "heart-pulse",
            "color_key": "red",
            "image_updated_at": None,
            "expense_count": 2,
            "total_amount": "100.00",
            "percentage_of_spending": "100.00",
            "has_custom_image": False,
            "image_url": None,
        }
    ]
    assert filtered_root.status_code == 200
    assert filtered_root.json()["total"] == 2
    assert filtered_child.status_code == 200
    assert filtered_child.json()["total"] == 1
    assert filtered_child.json()["items"][0]["id"] == child_expense.id


def test_overview_current_requires_login_completed_password_and_active_period(client, db_session):
    response = client.get("/api/v1/overview/current")
    assert response.status_code == 401

    create_test_user(db_session, username="nuam", must_change_password=True)
    login(client, "nuam")
    forced = client.get("/api/v1/overview/current")
    assert forced.status_code == 403

    forced_user = db_session.query(User).filter_by(username="nuam").one()
    forced_user.must_change_password = False
    db_session.commit()
    no_period = client.get("/api/v1/overview/current")
    assert no_period.status_code == 404
    assert no_period.json()["detail"]["code"] == "no_active_cash_period"


def test_admin_can_read_historical_overview_and_member_cannot(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    closed = create_cash_period(
        db_session,
        created_by_user_id=admin.id,
        name="Juni 2026",
        status=CashPeriodStatus.closed,
        opening_amount=Decimal("500.00"),
    )
    category = create_category(db_session, name="Historisch", sort_order=1, is_active=False, user_id=member.id)
    create_expense(
        db_session,
        cash_period_id=closed.id,
        category_id=category.id,
        created_by_user_id=member.id,
        amount=Decimal("125.00"),
        created_at=datetime(2026, 6, 3, 8, 0, tzinfo=timezone.utc),
    )

    login(client, "nuam")
    forbidden = client.get(f"/api/v1/overview/cash-periods/{closed.id}")
    assert forbidden.status_code == 403

    login(client, "admin")
    response = client.get(f"/api/v1/overview/cash-periods/{closed.id}")

    assert response.status_code == 200
    assert response.json()["summary"]["cash_period"]["status"] == "closed"
    assert response.json()["summary"]["spent_amount"] == "125.00"
    assert response.json()["categories"][0]["category_name"] == "Historisch"


def test_expense_list_filters_sorting_pagination_and_admin_voided_access(client, db_session):
    admin, member, _, cash_period, food, bank, _, first, second, voided = seed_overview_data(db_session)

    login(client, "nuam")
    member_list = client.get(
        f"/api/v1/overview/cash-periods/{cash_period.id}/expenses"
        f"?include_voided=true&category_id={food.id}&limit=10"
    )
    foreign_category = client.get(
        f"/api/v1/overview/cash-periods/{cash_period.id}/expenses"
        f"?category_id={bank.id}"
    )
    assert member_list.status_code == 200
    assert member_list.json()["total"] == 1
    assert [item["id"] for item in member_list.json()["items"]] == [first.id]
    assert foreign_category.status_code == 404
    assert foreign_category.json()["detail"]["code"] == "category_not_found"

    login(client, "admin")
    admin_list = client.get(
        f"/api/v1/overview/cash-periods/{cash_period.id}/expenses"
        "?include_voided=true&sort=amount_asc&limit=2&offset=0"
    )
    assert admin_list.status_code == 200
    assert admin_list.json()["total"] == 3
    assert admin_list.json()["has_more"] is True
    assert [item["id"] for item in admin_list.json()["items"]] == [voided.id, second.id]
    assert admin_list.json()["items"][0]["voided_by"]["id"] == admin.id
    assert admin_list.json()["items"][0]["void_reason"] == "Doppelt"

    second_page = client.get(
        f"/api/v1/overview/cash-periods/{cash_period.id}/expenses"
        "?include_voided=true&sort=amount_asc&limit=2&offset=2"
    )
    assert [item["id"] for item in second_page.json()["items"]] == [first.id]
    assert second_page.json()["has_more"] is False


def test_expense_list_date_user_validation_and_historical_permission(client, db_session):
    admin, member, _, cash_period, food, _, _, first, _, _ = seed_overview_data(db_session)
    closed = create_cash_period(
        db_session,
        created_by_user_id=admin.id,
        name="Juni 2026",
        status=CashPeriodStatus.closed,
    )

    login(client, "nuam")
    filtered = client.get(
        f"/api/v1/overview/cash-periods/{cash_period.id}/expenses"
        f"?created_by_user_id={member.id}&date_from=2026-07-02&date_to=2026-07-02"
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.json()["items"]] == [first.id]

    invalid_range = client.get(
        f"/api/v1/overview/cash-periods/{cash_period.id}/expenses?date_from=2026-07-05&date_to=2026-07-01"
    )
    invalid_sort = client.get(f"/api/v1/overview/cash-periods/{cash_period.id}/expenses?sort=name")
    invalid_category = client.get(f"/api/v1/overview/cash-periods/{cash_period.id}/expenses?category_id=9999")
    closed_for_member = client.get(f"/api/v1/overview/cash-periods/{closed.id}/expenses")

    assert invalid_range.status_code == 400
    assert invalid_range.json()["detail"]["code"] == "invalid_date_range"
    assert invalid_sort.status_code == 400
    assert invalid_sort.json()["detail"]["code"] == "invalid_sort"
    assert invalid_category.status_code == 404
    assert invalid_category.json()["detail"]["code"] == "category_not_found"
    assert closed_for_member.status_code == 403

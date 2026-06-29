from datetime import date
from decimal import Decimal

from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.category import Category
from app.models.expense import Expense
from app.models.user import UserRole
from conftest import create_test_user


def login(client, username: str, password: str = "password-123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def create_category(db_session, *, name: str = "Essen", is_active: bool = True) -> Category:
    category = Category(
        name=name,
        name_normalized=name.casefold(),
        icon_key="utensils",
        color_key="orange",
        sort_order=1,
        is_active=is_active,
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


def create_cash_period(
    db_session,
    *,
    created_by_user_id: int,
    opening_amount: Decimal = Decimal("20000.00"),
    status: CashPeriodStatus = CashPeriodStatus.active,
) -> CashPeriod:
    cash_period = CashPeriod(
        name="Juli 2026",
        opening_amount=opening_amount,
        currency="THB",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31) if status == CashPeriodStatus.closed else None,
        status=status,
        created_by_user_id=created_by_user_id,
    )
    db_session.add(cash_period)
    db_session.commit()
    db_session.refresh(cash_period)
    return cash_period


def create_expense_row(
    db_session,
    *,
    cash_period_id: int,
    category_id: int,
    created_by_user_id: int,
    amount: Decimal = Decimal("250.00"),
    is_voided: bool = False,
) -> Expense:
    expense = Expense(
        cash_period_id=cash_period_id,
        category_id=category_id,
        amount=amount,
        currency="THB",
        created_by_user_id=created_by_user_id,
        is_voided=is_voided,
    )
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)
    return expense


def test_member_can_create_expense_and_summary_uses_real_spending(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    category = create_category(db_session)
    cash_period = create_cash_period(db_session, created_by_user_id=admin.id)
    login(client, "nuam")

    response = client.post(
        "/api/v1/expenses",
        json={"category_id": category.id, "amount": "250,50"},
    )
    manipulated_creator = client.post(
        "/api/v1/expenses",
        json={"category_id": category.id, "amount": "1.00", "created_by_user_id": admin.id},
    )
    summary = client.get("/api/v1/cash-periods/current/summary")

    assert response.status_code == 201
    assert response.json()["expense"]["cash_period_id"] == cash_period.id
    assert response.json()["expense"]["category"]["name"] == "Essen"
    assert response.json()["expense"]["created_by"]["id"] == member.id
    assert response.json()["expense"]["amount"] == "250.50"
    assert response.json()["summary"]["spent_amount"] == "250.50"
    assert response.json()["summary"]["remaining_amount"] == "19749.50"
    assert summary.json()["spent_amount"] == "250.50"
    assert isinstance(db_session.get(Expense, response.json()["expense"]["id"]).amount, Decimal)
    assert manipulated_creator.status_code == 422


def test_create_expense_requires_active_cash_period_and_active_category(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    inactive_category = create_category(db_session, is_active=False)
    login(client, "admin")

    missing_cash_period = client.post(
        "/api/v1/expenses",
        json={"category_id": inactive_category.id, "amount": "10.00"},
    )
    create_cash_period(db_session, created_by_user_id=admin.id)
    missing_category = client.post("/api/v1/expenses", json={"category_id": 9999, "amount": "10.00"})
    inactive = client.post(
        "/api/v1/expenses",
        json={"category_id": inactive_category.id, "amount": "10.00"},
    )

    assert missing_cash_period.status_code == 404
    assert missing_cash_period.json()["detail"]["code"] == "no_active_cash_period"
    assert missing_category.status_code == 404
    assert inactive.status_code == 409
    assert inactive.json()["detail"]["code"] == "category_inactive"


def test_create_expense_validates_amount_and_remaining_amount(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    category = create_category(db_session)
    create_cash_period(db_session, created_by_user_id=admin.id, opening_amount=Decimal("500.00"))
    login(client, "admin")

    for amount in ["0", "-1.00", "10.123", "1000000000.00"]:
        response = client.post("/api/v1/expenses", json={"category_id": category.id, "amount": amount})
        assert response.status_code == 400

    full = client.post("/api/v1/expenses", json={"category_id": category.id, "amount": "500.00"})
    over_remaining = client.post("/api/v1/expenses", json={"category_id": category.id, "amount": "0.01"})

    assert full.status_code == 201
    assert full.json()["summary"]["remaining_amount"] == "0.00"
    assert over_remaining.status_code == 409
    assert over_remaining.json()["detail"]["code"] == "insufficient_remaining_amount"
    assert over_remaining.json()["detail"]["remaining_amount"] == "0.00"
    assert db_session.query(Expense).count() == 1


def test_current_expenses_are_sorted_filtered_and_hide_voided_for_members(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    category = create_category(db_session)
    other_category = create_category(db_session, name="Einkauf")
    cash_period = create_cash_period(db_session, created_by_user_id=admin.id)
    first = create_expense_row(
        db_session,
        cash_period_id=cash_period.id,
        category_id=category.id,
        created_by_user_id=member.id,
        amount=Decimal("100.00"),
    )
    second = create_expense_row(
        db_session,
        cash_period_id=cash_period.id,
        category_id=other_category.id,
        created_by_user_id=admin.id,
        amount=Decimal("200.00"),
    )
    voided = create_expense_row(
        db_session,
        cash_period_id=cash_period.id,
        category_id=category.id,
        created_by_user_id=member.id,
        amount=Decimal("300.00"),
        is_voided=True,
    )

    login(client, "nuam")
    member_response = client.get("/api/v1/expenses/current?include_voided=true")
    member_filtered = client.get(f"/api/v1/expenses/current?category_id={category.id}")
    login(client, "admin")
    admin_response = client.get("/api/v1/expenses/current?include_voided=true")
    admin_user_filter = client.get(f"/api/v1/expenses/current?created_by_user_id={member.id}")

    assert [item["id"] for item in member_response.json()] == [second.id, first.id]
    assert [item["id"] for item in member_filtered.json()] == [first.id]
    assert [item["id"] for item in admin_response.json()] == [voided.id, second.id, first.id]
    assert [item["created_by"]["id"] for item in admin_user_filter.json()] == [member.id]


def test_void_expense_permissions_and_summary(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    other_member = create_test_user(db_session, username="nok", role=UserRole.member)
    category = create_category(db_session)
    cash_period = create_cash_period(db_session, created_by_user_id=admin.id, opening_amount=Decimal("1000.00"))
    own_expense = create_expense_row(
        db_session,
        cash_period_id=cash_period.id,
        category_id=category.id,
        created_by_user_id=member.id,
        amount=Decimal("250.00"),
    )
    foreign_expense = create_expense_row(
        db_session,
        cash_period_id=cash_period.id,
        category_id=category.id,
        created_by_user_id=admin.id,
        amount=Decimal("300.00"),
    )

    login(client, "nok")
    forbidden = client.post(f"/api/v1/expenses/{foreign_expense.id}/void", json={})
    login(client, "nuam")
    own = client.post(f"/api/v1/expenses/{own_expense.id}/void", json={})
    duplicate = client.post(f"/api/v1/expenses/{own_expense.id}/void", json={})
    login(client, "admin")
    admin_void = client.post(f"/api/v1/expenses/{foreign_expense.id}/void", json={"reason": "Doppelt"})
    summary = client.get("/api/v1/cash-periods/current/summary")

    assert forbidden.status_code == 403
    assert own.status_code == 200
    assert own.json()["expense"]["is_voided"] is True
    assert own.json()["summary"]["remaining_amount"] == "700.00"
    assert duplicate.status_code == 409
    assert admin_void.status_code == 200
    assert admin_void.json()["expense"]["void_reason"] == "Doppelt"
    assert summary.json()["spent_amount"] == "0.00"
    assert db_session.get(Expense, own_expense.id).is_voided is True


def test_closed_cash_period_expenses_are_readable_but_not_voidable_or_editable(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    category = create_category(db_session)
    cash_period = create_cash_period(
        db_session,
        created_by_user_id=admin.id,
        status=CashPeriodStatus.closed,
    )
    expense = create_expense_row(
        db_session,
        cash_period_id=cash_period.id,
        category_id=category.id,
        created_by_user_id=admin.id,
    )
    login(client, "admin")

    read = client.get(f"/api/v1/expenses/{expense.id}")
    void = client.post(f"/api/v1/expenses/{expense.id}/void", json={})
    patch = client.patch(f"/api/v1/expenses/{expense.id}", json={"amount": "1.00"})
    delete = client.delete(f"/api/v1/expenses/{expense.id}")

    assert read.status_code == 200
    assert void.status_code == 409
    assert void.json()["detail"]["code"] == "cash_period_closed"
    assert patch.status_code == 405
    assert delete.status_code == 405

from datetime import date
from decimal import Decimal

from app.models import (
    Cashbook,
    CashbookMembership,
    CashbookRole,
    CashPeriod,
    CashPeriodStatus,
    Category,
    Expense,
    UserRole,
)
from conftest import create_test_user, get_test_cashbook


def login(client, username: str, password: str = "password-123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def create_period(db, admin_id: int) -> CashPeriod:
    period = CashPeriod(
        cashbook_id=get_test_cashbook(db).id,
        name="August 2026",
        opening_amount=Decimal("1000.00"),
        currency="THB",
        start_date=date(2026, 8, 1),
        status=CashPeriodStatus.active,
        created_by_user_id=admin_id,
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


def test_admin_and_member_share_period_categories_balance_and_creator(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    period = create_period(db_session, admin.id)

    login(client, "admin")
    category_response = client.post(
        "/api/v1/categories",
        json={
            "name": "Lebensmittel",
            "icon_key": "utensils",
            "color_key": "orange",
            "category_type": "expense",
        },
    )
    assert category_response.status_code == 201
    category_id = category_response.json()["id"]
    admin_booking = client.post(
        "/api/v1/expenses",
        json={"category_id": category_id, "amount": "100.00", "note": "Markt"},
    )

    login(client, "nuam")
    member_period = client.get("/api/v1/cash-periods/current")
    member_categories = client.get("/api/v1/categories")
    member_booking = client.post(
        "/api/v1/expenses",
        json={"category_id": category_id, "amount": "50.00", "note": "Bäckerei"},
    )
    member_summary = client.get("/api/v1/cash-periods/current/summary")
    member_expenses = client.get("/api/v1/expenses/current")

    login(client, "admin")
    admin_summary = client.get("/api/v1/cash-periods/current/summary")

    assert admin_booking.status_code == 201
    assert member_booking.status_code == 201
    assert member_period.json()["id"] == period.id
    assert category_id in {item["id"] for item in member_categories.json()}
    assert member_summary.json() == admin_summary.json()
    assert member_summary.json()["spent_amount"] == "150.00"
    assert member_summary.json()["remaining_amount"] == "850.00"
    creators = {item["created_by"]["id"] for item in member_expenses.json()}
    assert creators == {admin.id, member.id}
    notes = {item["note"] for item in member_expenses.json()}
    assert notes == {"Markt", "Bäckerei"}


def test_cashbook_admin_can_add_and_remove_existing_user_and_member_cannot_manage(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", role=UserRole.member)
    candidate = create_test_user(db_session, username="mali", role=UserRole.member)
    candidate_membership = db_session.query(CashbookMembership).filter_by(user_id=candidate.id).one()
    db_session.delete(candidate_membership)
    db_session.commit()

    login(client, "nuam")
    assert client.get("/api/v1/cashbooks/current/members").status_code == 403
    assert client.post(
        "/api/v1/cashbooks/current/members", json={"user_id": candidate.id}
    ).status_code == 403

    login(client, "admin")
    candidates = client.get("/api/v1/cashbooks/current/member-candidates")
    added = client.post(
        "/api/v1/cashbooks/current/members", json={"user_id": candidate.id}
    )
    members = client.get("/api/v1/cashbooks/current/members")
    removed = client.delete(f"/api/v1/cashbooks/current/members/{candidate.id}")

    assert candidates.status_code == 200
    assert candidate.id in {item["id"] for item in candidates.json()}
    assert added.status_code == 201
    assert added.json()["role"] == "member"
    assert {item["user"]["id"] for item in members.json()} == {admin.id, member.id, candidate.id}
    assert removed.status_code == 204
    assert db_session.query(CashbookMembership).filter_by(user_id=candidate.id).count() == 0


def test_membership_tenant_boundary_blocks_foreign_ids(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    outsider = create_test_user(db_session, username="outsider", role=UserRole.member)
    first_cashbook = get_test_cashbook(db_session)
    period = create_period(db_session, admin.id)
    category = Category(
        cashbook_id=first_cashbook.id,
        user_id=admin.id,
        name="Privat",
        name_normalized="privat",
        icon_key="wallet",
        color_key="blue",
        sort_order=1,
        is_active=True,
    )
    db_session.add(category)
    db_session.flush()
    expense = Expense(
        cash_period_id=period.id,
        category_id=category.id,
        amount=Decimal("10.00"),
        currency="THB",
        created_by_user_id=admin.id,
    )
    db_session.add(expense)
    outsider_membership = db_session.query(CashbookMembership).filter_by(user_id=outsider.id).one()
    db_session.delete(outsider_membership)
    second_cashbook = Cashbook(
        name="Andere Kasse",
        currency="THB",
        created_by_user_id=outsider.id,
        category_owner_user_id=outsider.id,
    )
    db_session.add(second_cashbook)
    db_session.flush()
    db_session.add(
        CashbookMembership(
            cashbook_id=second_cashbook.id,
            user_id=outsider.id,
            role=CashbookRole.admin,
        )
    )
    db_session.commit()

    login(client, "outsider")
    assert client.get(f"/api/v1/cash-periods/{period.id}").status_code == 404
    assert client.get(f"/api/v1/overview/cash-periods/{period.id}").status_code == 404
    assert client.get(f"/api/v1/expenses/{expense.id}").status_code == 404
    assert client.get(f"/api/v1/categories/{category.id}/image").status_code == 404
    assert client.get(f"/api/v1/cash-periods/{period.id}/export.xlsx").status_code == 404


def test_member_cannot_close_or_export_period(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    create_test_user(db_session, username="nuam", role=UserRole.member)
    period = create_period(db_session, admin.id)
    login(client, "nuam")

    assert client.post(f"/api/v1/cash-periods/{period.id}/close", json={}).status_code == 403
    assert client.get(f"/api/v1/cash-periods/{period.id}/export.xlsx").status_code == 403

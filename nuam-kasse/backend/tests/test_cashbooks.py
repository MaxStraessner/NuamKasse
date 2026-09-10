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


def test_member_cannot_close_but_can_export_period(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    create_test_user(db_session, username="nuam", role=UserRole.member)
    period = create_period(db_session, admin.id)
    login(client, "nuam")

    assert client.post(f"/api/v1/cash-periods/{period.id}/close", json={}).status_code == 403
    assert client.get(f"/api/v1/cash-periods/{period.id}/export.xlsx").status_code == 200


def test_user_can_create_list_and_switch_between_multiple_cashbooks(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    original_cashbook = get_test_cashbook(db_session)
    original_period = create_period(db_session, admin.id)
    original_counts = {
        "cashbooks": db_session.query(Cashbook).count(),
        "periods": db_session.query(CashPeriod).count(),
        "expenses": db_session.query(Expense).count(),
        "categories": db_session.query(Category).count(),
    }
    login(client, "admin")

    created = client.post(
        "/api/v1/cashbooks",
        json={
            "name": "Restaurant",
            "opening_amount": "12450.00",
            "description": "Abendkasse",
        },
    )

    assert created.status_code == 201
    new_cashbook_id = created.json()["id"]
    listed = client.get("/api/v1/cashbooks")
    assert listed.status_code == 200
    assert {item["name"] for item in listed.json()} == {"Testkasse", "Restaurant"}
    restaurant = next(item for item in listed.json() if item["id"] == new_cashbook_id)
    assert restaurant["current_balance"] == "12450.00"
    assert restaurant["active_period_id"] is not None

    selected = client.get(
        "/api/v1/cash-periods/current",
        headers={"X-Cashbook-ID": str(new_cashbook_id)},
    )
    assert selected.status_code == 200
    assert selected.json()["opening_amount"] == "12450.00"
    assert db_session.query(CashbookMembership).filter_by(user_id=admin.id).count() == 2
    assert db_session.get(CashPeriod, original_period.id).cashbook_id == original_cashbook.id
    new_cashbook_category_count = db_session.query(Category).filter_by(
        cashbook_id=new_cashbook_id,
    ).count()
    assert db_session.query(Cashbook).count() == original_counts["cashbooks"] + 1
    assert db_session.query(CashPeriod).count() == original_counts["periods"] + 1
    assert db_session.query(Expense).count() == original_counts["expenses"]
    assert new_cashbook_category_count > 0
    assert db_session.query(Category).count() == original_counts["categories"] + new_cashbook_category_count

    categories_before_read = db_session.query(Category).count()
    categories = client.get(
        "/api/v1/categories",
        headers={"X-Cashbook-ID": str(new_cashbook_id)},
    )
    assert categories.status_code == 200
    assert len(categories.json()) == new_cashbook_category_count
    assert db_session.query(Category).count() == categories_before_read


def test_cashbook_header_cannot_cross_membership_boundary(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    outsider = create_test_user(db_session, username="outsider", role=UserRole.member)
    login(client, "admin")
    created = client.post(
        "/api/v1/cashbooks",
        json={"name": "Nur Admin", "opening_amount": "100.00"},
    )
    assert created.status_code == 201

    login(client, "outsider")
    blocked = client.get(
        "/api/v1/cash-periods/current",
        headers={"X-Cashbook-ID": str(created.json()["id"])},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "cashbook_membership_required"

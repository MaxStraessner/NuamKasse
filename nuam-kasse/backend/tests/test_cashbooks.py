from datetime import date
from decimal import Decimal
from pathlib import Path

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
from app.models.user import utc_now
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
    original_category_count = db_session.query(Category).filter_by(
        cashbook_id=original_cashbook.id,
    ).count()
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
    assert new_cashbook_category_count == original_category_count
    assert db_session.query(Category).count() == original_counts["categories"] + new_cashbook_category_count

    categories_before_read = db_session.query(Category).count()
    categories = client.get(
        "/api/v1/categories",
        headers={"X-Cashbook-ID": str(new_cashbook_id)},
    )
    assert categories.status_code == 200
    assert len(categories.json()) == new_cashbook_category_count
    assert db_session.query(Category).count() == categories_before_read


def test_new_cashbook_inherits_complete_category_layout_and_remains_independent(
    client,
    db_session,
    settings,
):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    source_cashbook = get_test_cashbook(db_session)
    source_period = create_period(db_session, admin.id)
    roots = [
        Category(
            cashbook_id=source_cashbook.id,
            user_id=source_cashbook.category_owner_user_id,
            name=name,
            name_normalized=name.casefold(),
            icon_key=icon_key,
            color_key=color_key,
            category_type=category_type,
            sort_order=sort_order,
            is_active=True,
        )
        for name, icon_key, color_key, category_type, sort_order in (
            ("Kategorie B", "wallet", "blue", "expense", 2),
            ("Kategorie A", "utensils", "orange", "expense", 1),
            ("Kategorie D", "gift", "pink", "expense", 4),
            ("Kategorie C", "landmark", "green", "income", 3),
        )
    ]
    db_session.add_all(roots)
    db_session.flush()
    roots_by_name = {category.name: category for category in roots}
    roots_by_name["Kategorie D"].is_active = False
    roots_by_name["Kategorie D"].archived_at = utc_now()
    children = [
        Category(
            cashbook_id=source_cashbook.id,
            user_id=source_cashbook.category_owner_user_id,
            name=name,
            name_normalized=name.casefold(),
            icon_key="utensils",
            color_key="orange",
            category_type="expense",
            parent_category_id=roots_by_name["Kategorie A"].id,
            sort_order=sort_order,
            is_active=True,
        )
        for name, sort_order in (("Unterkategorie 2", 2), ("Unterkategorie 1", 1))
    ]
    db_session.add_all(children)
    db_session.flush()

    image_root = Path(settings.category_image_storage_path)
    original_path = image_root / "shared" / "category-a.original.jpg"
    preview_path = image_root / "shared" / "category-a.preview.webp"
    original_path.parent.mkdir(parents=True, exist_ok=True)
    original_path.write_bytes(b"original-image")
    preview_path.write_bytes(b"preview-image")
    category_a = roots_by_name["Kategorie A"]
    category_a.image_path = original_path.relative_to(image_root).as_posix()
    category_a.image_preview_path = preview_path.relative_to(image_root).as_posix()
    category_a.image_original_name = "category-a.jpg"
    category_a.image_mime_type = "image/jpeg"
    category_a.image_size = len(b"original-image")
    category_a.image_width = 640
    category_a.image_height = 480
    category_a.image_updated_at = utc_now()
    db_session.add(
        Expense(
            cash_period_id=source_period.id,
            category_id=children[0].id,
            amount=Decimal("25.00"),
            transaction_type="expense",
            currency="THB",
            created_by_user_id=admin.id,
        )
    )
    db_session.commit()

    def layout(cashbook_id: int):
        categories = db_session.query(Category).filter_by(cashbook_id=cashbook_id).all()
        names_by_id = {category.id: category.name for category in categories}
        items = [
            (
                names_by_id.get(category.parent_category_id),
                category.name,
                category.sort_order,
                category.icon_key,
                category.color_key,
                category.category_type,
                category.image_path,
                category.image_preview_path,
                category.image_original_name,
                category.image_mime_type,
                category.image_size,
                category.image_width,
                category.image_height,
                category.image_updated_at,
                category.is_active,
                category.archived_at,
            )
            for category in categories
        ]
        return sorted(items, key=lambda item: (item[0] or "", item[1]))

    source_layout = layout(source_cashbook.id)
    source_ids = {
        category.id
        for category in db_session.query(Category).filter_by(
            cashbook_id=source_cashbook.id
        )
    }
    counts_before = {
        "cashbooks": db_session.query(Cashbook).count(),
        "periods": db_session.query(CashPeriod).count(),
        "expenses": db_session.query(Expense).count(),
    }
    files_before = {path.relative_to(image_root) for path in image_root.rglob("*.*")}
    login(client, "admin")

    created = client.post(
        "/api/v1/cashbooks",
        headers={"X-Cashbook-ID": str(source_cashbook.id)},
        json={
            "name": "Neue Kasse",
            "opening_amount": "500.00",
            "template_cashbook_id": source_cashbook.id,
        },
    )

    assert created.status_code == 201
    target_cashbook_id = created.json()["id"]
    target_categories = db_session.query(Category).filter_by(
        cashbook_id=target_cashbook_id
    ).all()
    target_ids = {category.id for category in target_categories}
    assert target_ids.isdisjoint(source_ids)
    assert layout(target_cashbook_id) == source_layout
    assert db_session.query(Cashbook).count() == counts_before["cashbooks"] + 1
    assert db_session.query(CashPeriod).count() == counts_before["periods"] + 1
    assert db_session.query(Expense).count() == counts_before["expenses"]
    assert db_session.query(Expense).filter(
        Expense.cash_period.has(cashbook_id=target_cashbook_id)
    ).count() == 0
    assert {path.relative_to(image_root) for path in image_root.rglob("*.*")} == files_before

    listed = client.get(
        "/api/v1/categories",
        headers={"X-Cashbook-ID": str(target_cashbook_id)},
    )
    assert listed.status_code == 200
    listed_roots = [item for item in listed.json() if item["parent_category_id"] is None]
    assert [item["name"] for item in listed_roots] == [
        "Kategorie A",
        "Kategorie B",
        "Kategorie C",
    ]
    listed_children = [
        item for item in listed.json() if item["parent_category_id"] is not None
    ]
    assert [item["name"] for item in listed_children] == [
        "Unterkategorie 1",
        "Unterkategorie 2",
    ]
    assert len(
        {
            (item["parent_category_id"], item["name"].casefold())
            for item in listed.json()
        }
    ) == len(listed.json())

    all_listed = client.get(
        "/api/v1/categories?include_inactive=true",
        headers={"X-Cashbook-ID": str(target_cashbook_id)},
    )
    all_listed_roots = [
        item for item in all_listed.json() if item["parent_category_id"] is None
    ]
    assert [item["name"] for item in all_listed_roots] == [
        "Kategorie A",
        "Kategorie B",
        "Kategorie C",
        "Kategorie D",
    ]
    assert all_listed_roots[-1]["is_active"] is False

    target_roots = sorted(
        (category for category in target_categories if category.parent_category_id is None),
        key=lambda category: category.sort_order,
    )
    reordered = client.put(
        "/api/v1/categories/reorder",
        headers={"X-Cashbook-ID": str(target_cashbook_id)},
        json={"category_ids": [category.id for category in reversed(target_roots)]},
    )
    assert reordered.status_code == 200
    assert layout(source_cashbook.id) == source_layout

    copied_category_a = next(
        category for category in target_categories if category.name == "Kategorie A"
    )
    removed_image = client.delete(
        f"/api/v1/categories/{copied_category_a.id}/image",
        headers={"X-Cashbook-ID": str(target_cashbook_id)},
    )
    source_image = client.get(
        f"/api/v1/categories/{category_a.id}/image",
        headers={"X-Cashbook-ID": str(source_cashbook.id)},
    )
    db_session.refresh(category_a)
    assert removed_image.status_code == 200
    assert source_image.status_code == 200
    assert category_a.image_path == original_path.relative_to(image_root).as_posix()
    assert original_path.is_file()
    assert preview_path.is_file()


def test_cashbook_template_must_be_selected_when_context_is_ambiguous(
    client,
    db_session,
):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    source_cashbook = get_test_cashbook(db_session)
    login(client, "admin")
    second = client.post(
        "/api/v1/cashbooks",
        json={
            "name": "Zweite Kasse",
            "opening_amount": "100.00",
            "template_cashbook_id": source_cashbook.id,
        },
    )
    assert second.status_code == 201
    selected_by_header = client.post(
        "/api/v1/cashbooks",
        headers={"X-Cashbook-ID": str(second.json()["id"])},
        json={"name": "Dritte Kasse", "opening_amount": "100.00"},
    )
    assert selected_by_header.status_code == 201
    counts_before = {
        "cashbooks": db_session.query(Cashbook).count(),
        "periods": db_session.query(CashPeriod).count(),
        "categories": db_session.query(Category).count(),
    }

    ambiguous = client.post(
        "/api/v1/cashbooks",
        json={"name": "Ohne Vorlage", "opening_amount": "100.00"},
    )

    assert ambiguous.status_code == 400
    assert ambiguous.json()["detail"]["code"] == "cashbook_template_required"
    assert db_session.query(Cashbook).count() == counts_before["cashbooks"]
    assert db_session.query(CashPeriod).count() == counts_before["periods"]
    assert db_session.query(Category).count() == counts_before["categories"]


def test_user_cannot_copy_categories_from_inaccessible_cashbook(client, db_session):
    admin = create_test_user(db_session, username="admin", role=UserRole.admin)
    outsider = create_test_user(db_session, username="outsider", role=UserRole.member)
    outsider_membership = db_session.query(CashbookMembership).filter_by(
        user_id=outsider.id
    ).one()
    db_session.delete(outsider_membership)
    foreign_cashbook = Cashbook(
        name="Fremde Kasse",
        currency="THB",
        created_by_user_id=outsider.id,
        category_owner_user_id=outsider.id,
    )
    db_session.add(foreign_cashbook)
    db_session.flush()
    db_session.add(
        CashbookMembership(
            cashbook_id=foreign_cashbook.id,
            user_id=outsider.id,
            role=CashbookRole.admin,
        )
    )
    db_session.commit()
    counts_before = {
        "cashbooks": db_session.query(Cashbook).count(),
        "categories": db_session.query(Category).count(),
    }
    login(client, "admin")

    blocked = client.post(
        "/api/v1/cashbooks",
        json={
            "name": "Unzulässige Kopie",
            "opening_amount": "100.00",
            "template_cashbook_id": foreign_cashbook.id,
        },
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "cashbook_template_forbidden"
    assert db_session.query(Cashbook).count() == counts_before["cashbooks"]
    assert db_session.query(Category).count() == counts_before["categories"]


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

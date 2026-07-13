from datetime import date
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from PIL import Image

from app.core.config import Settings
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.category import Category, CategoryType
from app.models.expense import Expense
from app.models.user import User
from app.models.user import UserRole
from app.services.category_service import seed_default_categories
from conftest import create_test_user


def login(client, username: str, password: str):
    return client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )


def create_test_category(
    db_session,
    *,
    name: str,
    icon_key: str = "utensils",
    color_key: str = "orange",
    sort_order: int = 1,
    is_active: bool = True,
    parent_category_id: int | None = None,
    user_id: int | None = None,
    category_type: CategoryType = CategoryType.expense,
) -> Category:
    owner_id = user_id
    if owner_id is None:
        owner_id = db_session.query(User).order_by(User.id.asc()).first().id
    category = Category(
        user_id=owner_id,
        name=name.strip(),
        name_normalized=name.strip().casefold(),
        icon_key=icon_key,
        color_key=color_key,
        category_type=category_type,
        parent_category_id=parent_category_id,
        sort_order=sort_order,
        is_active=is_active,
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


def image_bytes(format_name: str = "PNG", size: tuple[int, int] = (12, 8)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, "#336699").save(buffer, format=format_name)
    return buffer.getvalue()


def upload_image(client, category_id: int, content: bytes | None = None, filename: str = "category.png", mime: str = "image/png"):
    return client.post(
        f"/api/v1/categories/{category_id}/image",
        files={"image": (filename, content if content is not None else image_bytes(), mime)},
    )


def test_member_can_list_active_categories_sorted(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    later = create_test_category(db_session, name="Bank", icon_key="landmark", color_key="blue", sort_order=2)
    first = create_test_category(db_session, name="Essen", sort_order=1)
    inactive = create_test_category(db_session, name="Alt", sort_order=0, is_active=False)
    login(client, "nuam", "member-pass")

    response = client.get("/api/v1/categories?include_inactive=true")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [inactive.id, first.id, later.id]
    assert [item["is_active"] for item in response.json()] == [False, True, True]


def test_admin_can_include_inactive_categories(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    active = create_test_category(db_session, name="Essen", sort_order=1)
    inactive = create_test_category(db_session, name="Alt", sort_order=2, is_active=False)
    login(client, "admin", "admin-pass")

    response = client.get("/api/v1/categories?include_inactive=true")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [active.id, inactive.id]


def test_categories_require_login_and_completed_password_change(client, db_session):
    user = create_test_user(
        db_session,
        username="nuam",
        password="member-pass",
        must_change_password=True,
    )
    create_test_category(db_session, name="Essen", user_id=user.id)

    missing = client.get("/api/v1/categories")
    login(client, "nuam", "member-pass")
    forced_change = client.get("/api/v1/categories")

    assert missing.status_code == 401
    assert forced_change.status_code == 403


def test_admin_can_create_category_with_normalized_unique_name(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    create_test_category(db_session, name="Bank", sort_order=4)
    login(client, "admin", "admin-pass")

    response = client.post(
        "/api/v1/categories",
        json={"name": " Essen ", "icon_key": "utensils", "color_key": "orange"},
    )
    duplicate = client.post(
        "/api/v1/categories",
        json={"name": "ESSEN", "icon_key": "utensils", "color_key": "orange"},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Essen"
    assert response.json()["sort_order"] == 5
    assert response.json()["is_active"] is True
    assert response.json()["category_type"] == "expense"
    assert duplicate.status_code == 400


def test_category_type_can_be_created_changed_and_is_inherited(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")

    income = client.post(
        "/api/v1/categories",
        json={"name": "Gehalt", "icon_key": "wallet", "color_key": "green", "category_type": "income"},
    )
    child = client.post(
        "/api/v1/categories",
        json={
            "name": "Bonus",
            "icon_key": "gift",
            "color_key": "green",
            "parent_category_id": income.json()["id"],
        },
    )

    assert income.status_code == 201
    assert income.json()["category_type"] == "income"
    assert child.status_code == 201
    assert child.json()["category_type"] == "income"

    child_type_change = client.patch(f"/api/v1/categories/{child.json()['id']}", json={"category_type": "expense"})
    changed = client.patch(f"/api/v1/categories/{income.json()['id']}", json={"category_type": "expense"})
    listed = client.get("/api/v1/categories")

    assert child_type_change.status_code == 400
    assert changed.status_code == 200
    assert changed.json()["category_type"] == "expense"
    assert {item["name"]: item["category_type"] for item in listed.json()}["Bonus"] == "expense"


def test_invalid_category_type_is_rejected(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")

    created = client.post(
        "/api/v1/categories",
        json={"name": "Gehalt", "icon_key": "wallet", "color_key": "green", "category_type": "credit"},
    )

    assert created.status_code == 422


def test_admin_can_create_subcategories_and_reject_invalid_hierarchy(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    health = create_test_category(db_session, name="Gesundheit", icon_key="heart-pulse", color_key="red")
    mobility = create_test_category(db_session, name="Mobilitaet", icon_key="car", color_key="teal", sort_order=2)
    pharmacy = create_test_category(
        db_session,
        name="Apotheke",
        icon_key="pill",
        color_key="red",
        parent_category_id=health.id,
    )
    login(client, "admin", "admin-pass")

    created = client.post(
        "/api/v1/categories",
        json={
            "name": "Arzt",
            "icon_key": "heart-pulse",
            "color_key": "red",
            "parent_category_id": health.id,
        },
    )
    third_level = client.post(
        "/api/v1/categories",
        json={
            "name": "Rezept",
            "icon_key": "pill",
            "color_key": "red",
            "parent_category_id": pharmacy.id,
        },
    )
    duplicate_same_parent = client.post(
        "/api/v1/categories",
        json={
            "name": " apotheke ",
            "icon_key": "pill",
            "color_key": "red",
            "parent_category_id": health.id,
        },
    )
    duplicate_other_parent = client.post(
        "/api/v1/categories",
        json={
            "name": "Apotheke",
            "icon_key": "pill",
            "color_key": "teal",
            "parent_category_id": mobility.id,
        },
    )

    assert created.status_code == 201
    assert created.json()["parent_category_id"] == health.id
    assert third_level.status_code == 400
    assert duplicate_same_parent.status_code == 400
    assert duplicate_other_parent.status_code == 201


def test_category_parent_validation_rejects_foreign_inactive_and_self_parent(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    member = create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    own = create_test_category(db_session, name="Eigen", user_id=member.id)
    inactive = create_test_category(db_session, name="Alt", is_active=False, user_id=member.id)
    foreign = create_test_category(db_session, name="Fremd", user_id=admin.id)
    login(client, "nuam", "member-pass")

    foreign_parent = client.post(
        "/api/v1/categories",
        json={
            "name": "Unter Fremd",
            "icon_key": "utensils",
            "color_key": "orange",
            "parent_category_id": foreign.id,
        },
    )
    inactive_parent = client.post(
        "/api/v1/categories",
        json={
            "name": "Unter Alt",
            "icon_key": "utensils",
            "color_key": "orange",
            "parent_category_id": inactive.id,
        },
    )
    self_parent = client.patch(f"/api/v1/categories/{own.id}", json={"parent_category_id": own.id})

    assert foreign_parent.status_code == 400
    assert inactive_parent.status_code == 400
    assert self_parent.status_code == 400


def test_admin_can_move_and_reorder_subcategories(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    health = create_test_category(db_session, name="Gesundheit", icon_key="heart-pulse", color_key="red")
    mobility = create_test_category(db_session, name="Mobilitaet", icon_key="car", color_key="teal", sort_order=2)
    pharmacy = create_test_category(
        db_session,
        name="Apotheke",
        icon_key="pill",
        color_key="red",
        parent_category_id=health.id,
    )
    doctor = create_test_category(
        db_session,
        name="Arzt",
        icon_key="heart-pulse",
        color_key="red",
        parent_category_id=health.id,
        sort_order=2,
    )
    login(client, "admin", "admin-pass")

    moved = client.patch(f"/api/v1/categories/{pharmacy.id}", json={"parent_category_id": mobility.id})
    reordered = client.put(
        "/api/v1/categories/reorder",
        json={"parent_category_id": health.id, "category_ids": [doctor.id]},
    )

    assert moved.status_code == 200
    assert moved.json()["parent_category_id"] == mobility.id
    assert reordered.status_code == 200
    assert [item["id"] for item in reordered.json() if item["parent_category_id"] == health.id] == [doctor.id]


def test_user_can_create_category_and_invalid_name_icon_and_color_are_rejected(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    login(client, "nuam", "member-pass")

    member = client.post(
        "/api/v1/categories",
        json={"name": "Essen", "icon_key": "utensils", "color_key": "orange"},
    )
    login(client, "nuam", "member-pass")
    assert member.status_code == 201

    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")
    blank = client.post(
        "/api/v1/categories",
        json={"name": "   ", "icon_key": "utensils", "color_key": "orange"},
    )
    too_long = client.post(
        "/api/v1/categories",
        json={"name": "x" * 51, "icon_key": "utensils", "color_key": "orange"},
    )
    bad_icon = client.post(
        "/api/v1/categories",
        json={"name": "Essen", "icon_key": "<svg>", "color_key": "orange"},
    )
    bad_color = client.post(
        "/api/v1/categories",
        json={"name": "Essen", "icon_key": "utensils", "color_key": "#ff9900"},
    )

    assert blank.status_code == 400
    assert too_long.status_code == 422
    assert bad_icon.status_code == 400
    assert bad_color.status_code == 400


def test_admin_can_update_deactivate_and_reactivate_category(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    category = create_test_category(db_session, name="Essen")
    login(client, "admin", "admin-pass")

    updated = client.patch(
        f"/api/v1/categories/{category.id}",
        json={
            "name": "Lebensmittel",
            "icon_key": "shopping-cart",
            "color_key": "green",
            "is_active": False,
        },
    )
    reactivated = client.patch(f"/api/v1/categories/{category.id}", json={"is_active": True})

    assert updated.status_code == 200
    assert updated.json()["name"] == "Lebensmittel"
    assert updated.json()["icon_key"] == "shopping-cart"
    assert updated.json()["color_key"] == "green"
    assert updated.json()["is_active"] is False
    assert updated.json()["archived_at"] is not None
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True
    assert reactivated.json()["archived_at"] is None


def test_category_archive_restore_delete_and_delete_guards(client, db_session):
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    used = create_test_category(db_session, name="Benutzt", user_id=admin.id)
    parent = create_test_category(db_session, name="Ober", user_id=admin.id, sort_order=2)
    child = create_test_category(db_session, name="Unter", user_id=admin.id, parent_category_id=parent.id)
    deletable = create_test_category(db_session, name="Leer", user_id=admin.id, sort_order=3)
    login(client, "admin", "admin-pass")

    cash_period = CashPeriod(
        name="Juli 2026",
        opening_amount=Decimal("100.00"),
        currency="THB",
        start_date=date(2026, 7, 1),
        status=CashPeriodStatus.active,
        created_by_user_id=admin.id,
    )
    db_session.add(cash_period)
    db_session.commit()
    db_session.add(
        Expense(
            cash_period_id=cash_period.id,
            category_id=used.id,
            amount=Decimal("1.00"),
            currency="THB",
            created_by_user_id=admin.id,
        )
    )
    db_session.commit()

    archived = client.post(f"/api/v1/categories/{used.id}/archive")
    restored = client.post(f"/api/v1/categories/{used.id}/restore")
    delete_used = client.delete(f"/api/v1/categories/{used.id}")
    delete_parent = client.delete(f"/api/v1/categories/{parent.id}")
    delete_child = client.delete(f"/api/v1/categories/{child.id}")
    delete_empty = client.delete(f"/api/v1/categories/{deletable.id}")

    assert archived.status_code == 200
    assert archived.json()["is_active"] is False
    assert archived.json()["archived_at"] is not None
    assert restored.status_code == 200
    assert restored.json()["is_active"] is True
    assert restored.json()["archived_at"] is None
    assert delete_used.status_code == 400
    assert delete_parent.status_code == 400
    assert delete_child.status_code == 204
    assert delete_empty.status_code == 204


def test_update_rejects_foreign_unknown_category_and_duplicate_name(client, db_session):
    member = create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    admin = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    first = create_test_category(db_session, name="Essen", user_id=admin.id)
    second = create_test_category(db_session, name="Bank", icon_key="landmark", color_key="blue", sort_order=2, user_id=admin.id)
    login(client, "nuam", "member-pass")
    foreign = client.patch(f"/api/v1/categories/{first.id}", json={"name": "Neu"})

    login(client, "admin", "admin-pass")
    missing = client.patch("/api/v1/categories/9999", json={"name": "Neu"})
    duplicate = client.patch(f"/api/v1/categories/{second.id}", json={"name": " essen "})

    assert foreign.status_code == 404
    assert missing.status_code == 404
    assert duplicate.status_code == 400


def test_admin_can_reorder_categories_transactionally(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    first = create_test_category(db_session, name="Essen", sort_order=1)
    second = create_test_category(db_session, name="Bank", icon_key="landmark", color_key="blue", sort_order=2)
    third = create_test_category(db_session, name="Reise", icon_key="plane", color_key="indigo", sort_order=3)
    login(client, "admin", "admin-pass")

    response = client.put(
        "/api/v1/categories/reorder",
        json={"category_ids": [third.id, first.id, second.id]},
    )
    duplicate = client.put(
        "/api/v1/categories/reorder",
        json={"category_ids": [third.id, third.id, second.id]},
    )
    unknown = client.put(
        "/api/v1/categories/reorder",
        json={"category_ids": [third.id, first.id, 9999]},
    )
    incomplete = client.put(
        "/api/v1/categories/reorder",
        json={"category_ids": [third.id, first.id]},
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [third.id, first.id, second.id]
    assert [item["sort_order"] for item in response.json()] == [1, 2, 3]
    assert duplicate.status_code == 400
    assert unknown.status_code == 400
    assert incomplete.status_code == 400
    db_session.refresh(third)
    db_session.refresh(first)
    db_session.refresh(second)
    assert (third.sort_order, first.sort_order, second.sort_order) == (1, 2, 3)


def test_member_can_reorder_and_read_catalog_for_own_categories(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    category = create_test_category(db_session, name="Essen")
    login(client, "nuam", "member-pass")

    reorder = client.put("/api/v1/categories/reorder", json={"category_ids": [category.id]})
    catalog = client.get("/api/v1/categories/catalog")

    assert reorder.status_code == 200
    assert catalog.status_code == 200


def test_admin_can_read_catalog_with_known_values(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")

    response = client.get("/api/v1/categories/catalog")

    assert response.status_code == 200
    icon_keys = {item["key"] for item in response.json()["icons"]}
    color_keys = {item["key"] for item in response.json()["colors"]}
    assert {"utensils", "shopping-cart", "circle-ellipsis"}.issubset(icon_keys)
    assert {"orange", "green", "gray"}.issubset(color_keys)


def test_seed_default_categories_is_idempotent_and_does_not_overwrite(client, db_session):
    user = create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    existing = create_test_category(
        db_session,
        name="Essen",
        icon_key="coffee",
        color_key="blue",
        sort_order=7,
        user_id=user.id,
    )

    created, already_existing = seed_default_categories(db_session)
    second_created, second_existing = seed_default_categories(db_session)

    db_session.refresh(existing)
    assert created == 0
    assert already_existing == 1
    assert second_created == 0
    assert second_existing == 1
    assert existing.icon_key == "coffee"
    assert db_session.query(Category).count() == 1


def test_user_can_upload_root_and_subcategory_images(client, db_session, settings: Settings):
    user = create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    root = create_test_category(db_session, name="Gesundheit", icon_key="heart-pulse", color_key="red", user_id=user.id)
    child = create_test_category(
        db_session,
        name="Apotheke",
        icon_key="pill",
        color_key="red",
        parent_category_id=root.id,
        user_id=user.id,
    )
    login(client, "nuam", "member-pass")

    root_upload = upload_image(client, root.id)
    child_upload = upload_image(client, child.id, filename="apotheke.webp", content=image_bytes("WEBP"), mime="image/webp")

    assert root_upload.status_code == 200
    assert root_upload.json()["has_custom_image"] is True
    assert root_upload.json()["image_url"].startswith(f"/api/v1/categories/{root.id}/image?v=")
    assert root_upload.json()["icon_key"] == "heart-pulse"
    assert child_upload.status_code == 200
    assert child_upload.json()["image_url"].startswith(f"/api/v1/categories/{child.id}/image?v=")
    assert child_upload.json()["image_url"] != root_upload.json()["image_url"]
    assert len(list(Path(settings.category_image_storage_path).rglob("*.*"))) == 4


def test_category_image_can_be_read_replaced_and_deleted(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    category = create_test_category(db_session, name="Essen")
    login(client, "nuam", "member-pass")

    uploaded = upload_image(client, category.id)
    image = client.get(f"/api/v1/categories/{category.id}/image")
    first_url = uploaded.json()["image_url"]
    replaced = upload_image(client, category.id, content=image_bytes("JPEG"), filename="new.jpg", mime="image/jpeg")
    deleted = client.delete(f"/api/v1/categories/{category.id}/image")
    missing = client.get(f"/api/v1/categories/{category.id}/image")

    assert uploaded.status_code == 200
    assert image.status_code == 200
    assert image.headers["content-type"].startswith("image/webp")
    assert replaced.status_code == 200
    assert replaced.json()["image_url"] != first_url
    assert deleted.status_code == 200
    assert deleted.json()["has_custom_image"] is False
    assert deleted.json()["image_url"] is None
    assert category.icon_key == "utensils"
    assert missing.status_code == 404


def test_category_image_upload_rejects_invalid_too_large_and_foreign_files(client, db_session, settings: Settings):
    owner = create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    other = create_test_user(db_session, username="other", password="other-pass", role=UserRole.member)
    own = create_test_category(db_session, name="Eigen", user_id=owner.id)
    foreign = create_test_category(db_session, name="Fremd", user_id=other.id)
    login(client, "nuam", "member-pass")

    invalid = upload_image(client, own.id, content=b"<svg></svg>", filename="bad.svg", mime="image/svg+xml")
    too_large = upload_image(client, own.id, content=b"x" * (settings.category_image_max_bytes + 1))
    foreign_upload = upload_image(client, foreign.id)
    foreign_read = client.get(f"/api/v1/categories/{foreign.id}/image")

    assert invalid.status_code == 400
    assert too_large.status_code == 400
    assert foreign_upload.status_code == 404
    assert foreign_read.status_code == 404


def test_missing_category_image_file_returns_404_and_category_delete_removes_files(client, db_session, settings: Settings):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    missing_file_category = create_test_category(db_session, name="Fehlt")
    deletable = create_test_category(db_session, name="Leer", sort_order=2)
    login(client, "nuam", "member-pass")

    upload_image(client, missing_file_category.id)
    db_session.refresh(missing_file_category)
    preview_path = Path(settings.category_image_storage_path) / missing_file_category.image_preview_path
    preview_path.unlink()
    missing_response = client.get(f"/api/v1/categories/{missing_file_category.id}/image")

    upload_image(client, deletable.id)
    db_session.refresh(deletable)
    image_path = Path(settings.category_image_storage_path) / deletable.image_path
    delete_response = client.delete(f"/api/v1/categories/{deletable.id}")

    assert missing_response.status_code == 404
    assert delete_response.status_code == 204
    assert not image_path.exists()

from app.models.category import Category
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
) -> Category:
    category = Category(
        name=name.strip(),
        name_normalized=name.strip().casefold(),
        icon_key=icon_key,
        color_key=color_key,
        sort_order=sort_order,
        is_active=is_active,
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


def test_member_can_list_active_categories_sorted(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    later = create_test_category(db_session, name="Bank", icon_key="landmark", color_key="blue", sort_order=2)
    first = create_test_category(db_session, name="Essen", sort_order=1)
    create_test_category(db_session, name="Alt", sort_order=0, is_active=False)
    login(client, "nuam", "member-pass")

    response = client.get("/api/v1/categories?include_inactive=true")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [first.id, later.id]
    assert all(item["is_active"] for item in response.json())


def test_admin_can_include_inactive_categories(client, db_session):
    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    active = create_test_category(db_session, name="Essen", sort_order=1)
    inactive = create_test_category(db_session, name="Alt", sort_order=2, is_active=False)
    login(client, "admin", "admin-pass")

    response = client.get("/api/v1/categories?include_inactive=true")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [active.id, inactive.id]


def test_categories_require_login_and_completed_password_change(client, db_session):
    create_test_category(db_session, name="Essen")
    create_test_user(
        db_session,
        username="nuam",
        password="member-pass",
        must_change_password=True,
    )

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
    assert duplicate.status_code == 400


def test_create_category_rejects_member_invalid_name_icon_and_color(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    login(client, "nuam", "member-pass")

    member = client.post(
        "/api/v1/categories",
        json={"name": "Essen", "icon_key": "utensils", "color_key": "orange"},
    )
    login(client, "nuam", "member-pass")
    assert member.status_code == 403

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
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True


def test_update_rejects_member_unknown_category_and_duplicate_name(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    first = create_test_category(db_session, name="Essen")
    second = create_test_category(db_session, name="Bank", icon_key="landmark", color_key="blue", sort_order=2)
    login(client, "nuam", "member-pass")
    member = client.patch(f"/api/v1/categories/{first.id}", json={"name": "Neu"})

    create_test_user(db_session, username="admin", password="admin-pass", role=UserRole.admin)
    login(client, "admin", "admin-pass")
    missing = client.patch("/api/v1/categories/9999", json={"name": "Neu"})
    duplicate = client.patch(f"/api/v1/categories/{second.id}", json={"name": " essen "})

    assert member.status_code == 403
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


def test_member_cannot_reorder_or_read_catalog(client, db_session):
    create_test_user(db_session, username="nuam", password="member-pass", role=UserRole.member)
    category = create_test_category(db_session, name="Essen")
    login(client, "nuam", "member-pass")

    reorder = client.put("/api/v1/categories/reorder", json={"category_ids": [category.id]})
    catalog = client.get("/api/v1/categories/catalog")

    assert reorder.status_code == 403
    assert catalog.status_code == 403


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
    existing = create_test_category(
        db_session,
        name="Essen",
        icon_key="coffee",
        color_key="blue",
        sort_order=7,
    )

    created, already_existing = seed_default_categories(db_session)
    second_created, second_existing = seed_default_categories(db_session)

    db_session.refresh(existing)
    assert created == 11
    assert already_existing == 1
    assert second_created == 0
    assert second_existing == 12
    assert existing.icon_key == "coffee"
    assert db_session.query(Category).count() == 12

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.category_colors import (
    CATEGORY_COLORS,
    is_valid_category_color,
)
from app.core.category_icons import (
    CATEGORY_ICONS,
    is_valid_category_icon,
)
from app.models.category import Category
from app.models.user import utc_now


class CategoryServiceError(ValueError):
    pass


DEFAULT_CATEGORIES: tuple[dict[str, str], ...] = (
    {"name": "Essen", "icon_key": "utensils", "color_key": "orange"},
    {"name": "Einkauf", "icon_key": "shopping-cart", "color_key": "green"},
    {"name": "Gesundheit", "icon_key": "heart-pulse", "color_key": "red"},
    {"name": "Strom", "icon_key": "zap", "color_key": "yellow"},
    {"name": "Bank", "icon_key": "landmark", "color_key": "blue"},
    {"name": "Geschenk", "icon_key": "gift", "color_key": "pink"},
    {"name": "Reise", "icon_key": "plane", "color_key": "indigo"},
    {"name": "Motorrad", "icon_key": "bike", "color_key": "teal"},
    {"name": "Taxi", "icon_key": "car-taxi-front", "color_key": "yellow"},
    {"name": "Unterkunft", "icon_key": "hotel", "color_key": "purple"},
    {"name": "Geburtstag", "icon_key": "cake", "color_key": "pink"},
    {"name": "Sonstiges", "icon_key": "circle-ellipsis", "color_key": "gray"},
)


def normalize_category_name(name: str) -> str:
    return name.strip().casefold()


def _validate_name(name: str) -> tuple[str, str]:
    clean_name = name.strip()
    normalized = normalize_category_name(clean_name)
    if not clean_name or not normalized:
        raise CategoryServiceError("Der Kategoriename darf nicht leer sein.")
    if len(clean_name) > 50:
        raise CategoryServiceError("Der Kategoriename darf hoechstens 50 Zeichen lang sein.")
    return clean_name, normalized


def _validate_icon(icon_key: str) -> str:
    clean_icon = icon_key.strip()
    if not clean_icon or not is_valid_category_icon(clean_icon):
        raise CategoryServiceError("Dieses Symbol ist nicht zulaessig.")
    return clean_icon


def _validate_color(color_key: str) -> str:
    clean_color = color_key.strip()
    if not clean_color or not is_valid_category_color(clean_color):
        raise CategoryServiceError("Diese Farbe ist nicht zulaessig.")
    return clean_color


def ensure_unique_category_name(
    db: Session,
    name: str,
    exclude_category_id: int | None = None,
) -> tuple[str, str]:
    clean_name, normalized = _validate_name(name)
    query = select(Category).where(Category.name_normalized == normalized)
    existing = db.scalar(query)
    if existing and existing.id != exclude_category_id:
        raise CategoryServiceError("Dieser Kategoriename ist bereits vorhanden.")
    return clean_name, normalized


def next_sort_order(db: Session) -> int:
    highest = db.scalar(select(func.max(Category.sort_order)))
    return int(highest or 0) + 1


def list_categories(db: Session, *, include_inactive: bool = False) -> list[Category]:
    query = select(Category)
    if not include_inactive:
        query = query.where(Category.is_active.is_(True))
    query = query.order_by(
        Category.sort_order.asc(),
        Category.name_normalized.asc(),
        Category.id.asc(),
    )
    return list(db.scalars(query))


def get_category_by_id(db: Session, category_id: int) -> Category | None:
    return db.get(Category, category_id)


def create_category(
    db: Session,
    *,
    name: str,
    icon_key: str,
    color_key: str,
    sort_order: int | None = None,
) -> Category:
    clean_name, normalized = ensure_unique_category_name(db, name)
    clean_icon = _validate_icon(icon_key)
    clean_color = _validate_color(color_key)
    order = sort_order if sort_order is not None else next_sort_order(db)
    if order < 1:
        raise CategoryServiceError("Die Sortierung muss bei 1 beginnen.")

    category = Category(
        name=clean_name,
        name_normalized=normalized,
        icon_key=clean_icon,
        color_key=clean_color,
        sort_order=order,
        is_active=True,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(
    db: Session,
    category: Category,
    *,
    name: str | None = None,
    icon_key: str | None = None,
    color_key: str | None = None,
    is_active: bool | None = None,
) -> Category:
    if name is not None:
        clean_name, normalized = ensure_unique_category_name(
            db,
            name,
            exclude_category_id=category.id,
        )
        category.name = clean_name
        category.name_normalized = normalized

    if icon_key is not None:
        category.icon_key = _validate_icon(icon_key)

    if color_key is not None:
        category.color_key = _validate_color(color_key)

    if is_active is not None:
        category.is_active = is_active

    category.updated_at = utc_now()
    db.commit()
    db.refresh(category)
    return category


def reorder_categories(db: Session, *, category_ids: list[int]) -> list[Category]:
    if len(category_ids) != len(set(category_ids)):
        raise CategoryServiceError("Jede Kategorie darf nur einmal sortiert werden.")

    categories = list(db.scalars(select(Category).order_by(Category.id.asc())))
    categories_by_id = {category.id: category for category in categories}
    known_ids = set(categories_by_id)
    requested_ids = set(category_ids)

    if requested_ids - known_ids:
        raise CategoryServiceError("Mindestens eine Kategorie wurde nicht gefunden.")
    if requested_ids != known_ids:
        raise CategoryServiceError("Die Sortierung muss alle Kategorien enthalten.")

    now = utc_now()
    for index, category_id in enumerate(category_ids, 1):
        category = categories_by_id[category_id]
        category.sort_order = index
        category.updated_at = now

    db.commit()
    return list_categories(db, include_inactive=True)


def get_category_catalog() -> dict[str, object]:
    return {
        "icons": [dict(item) for item in CATEGORY_ICONS],
        "colors": [dict(item) for item in CATEGORY_COLORS],
    }


def seed_default_categories(db: Session) -> tuple[int, int]:
    created = 0
    existing = 0
    for item in DEFAULT_CATEGORIES:
        normalized = normalize_category_name(item["name"])
        found = db.scalar(select(Category).where(Category.name_normalized == normalized))
        if found:
            existing += 1
            continue

        category = Category(
            name=item["name"],
            name_normalized=normalized,
            icon_key=item["icon_key"],
            color_key=item["color_key"],
            sort_order=next_sort_order(db),
            is_active=True,
        )
        db.add(category)
        created += 1

    db.commit()
    return created, existing

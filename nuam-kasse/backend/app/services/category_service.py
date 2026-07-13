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
from app.core.config import Settings
from app.models.category import Category, CategoryType
from app.models.expense import Expense
from app.models.user import User, utc_now
from app.services.category_image_service import delete_category_image_paths


class CategoryServiceError(ValueError):
    pass


_UNSET = object()


DEFAULT_CATEGORY_STRUCTURE: tuple[dict[str, object], ...] = (
    {
        "name": "Ernährung",
        "icon_key": "utensils",
        "color_key": "orange",
        "children": ("Supermarkt", "Bäckerei", "Metzgerei", "Getränke", "Restaurant", "Café", "Imbiss", "Lieferdienst", "Kantine", "Snacks und Süßigkeiten", "Sonstiges"),
    },
    {
        "name": "Haushalt",
        "icon_key": "house",
        "color_key": "green",
        "children": ("Drogerie", "Reinigungsmittel", "Haushaltswaren", "Möbel", "Dekoration", "Küchengeräte", "Reparaturen", "Garten", "Sonstiges"),
    },
    {
        "name": "Wohnen",
        "icon_key": "house",
        "color_key": "blue",
        "children": ("Miete", "Strom", "Gas", "Wasser", "Heizung", "Nebenkosten", "Internet", "Rundfunkbeitrag", "Renovierung", "Sonstiges"),
    },
    {
        "name": "Gesundheit",
        "icon_key": "heart-pulse",
        "color_key": "red",
        "children": ("Apotheke", "Arzt", "Zahnarzt", "Krankenhaus", "Medikamente", "Brille und Kontaktlinsen", "Physiotherapie", "Therapie", "medizinische Hilfsmittel", "Pflege", "Sonstiges"),
    },
    {
        "name": "Mobilität",
        "icon_key": "car",
        "color_key": "teal",
        "children": ("Tanken", "Bus und Bahn", "Taxi", "Fahrrad", "Autoreparatur", "Autowäsche", "Parken", "Maut", "Fahrzeugversicherung", "Fahrzeugsteuer", "Sonstiges"),
    },
    {
        "name": "Kinder und Familie",
        "icon_key": "baby",
        "color_key": "pink",
        "children": ("Kindergarten", "Schule", "Kleidung", "Spielzeug", "Taschengeld", "Betreuung", "Ausflüge", "Babyausstattung", "Vereinsbeiträge", "Sonstiges"),
    },
    {
        "name": "Kleidung und Pflege",
        "icon_key": "shirt",
        "color_key": "purple",
        "children": ("Kleidung", "Schuhe", "Friseur", "Kosmetik", "Körperpflege", "Schmuck", "Accessoires", "Reinigung", "Sonstiges"),
    },
    {
        "name": "Freizeit",
        "icon_key": "cake",
        "color_key": "indigo",
        "children": ("Kino", "Sport", "Hobby", "Musik", "Bücher", "Spiele", "Veranstaltungen", "Ausflüge", "Abonnements", "Sonstiges"),
    },
    {
        "name": "Reisen",
        "icon_key": "plane",
        "color_key": "blue",
        "children": ("Unterkunft", "Flug", "Bahn", "Mietwagen", "Verpflegung", "Eintritt", "Reiseversicherung", "Souvenirs", "Sonstiges"),
    },
    {
        "name": "Finanzen und Verträge",
        "icon_key": "landmark",
        "color_key": "gray",
        "children": ("Versicherungen", "Bankgebühren", "Kredite", "Ratenzahlungen", "Steuern", "Gebühren", "Telefon", "Abonnements", "Mitgliedschaften", "Sonstiges"),
    },
    {
        "name": "Haustiere",
        "icon_key": "paw-print",
        "color_key": "orange",
        "children": ("Futter", "Tierarzt", "Medikamente", "Zubehör", "Pflege", "Versicherung", "Hundeschule", "Sonstiges"),
    },
    {
        "name": "Geschenke und Sonstiges",
        "icon_key": "gift",
        "color_key": "pink",
        "children": ("Geschenke", "Spenden", "Unterstützung Familie", "Bargeld", "unbekannte Ausgabe", "Sonstiges"),
    },
)


def normalize_category_name(name: str) -> str:
    return name.strip().casefold()


def _validate_name(name: str) -> tuple[str, str]:
    clean_name = name.strip()
    normalized = normalize_category_name(clean_name)
    if not clean_name or not normalized:
        raise CategoryServiceError("Der Kategoriename darf nicht leer sein.")
    if len(clean_name) > 50:
        raise CategoryServiceError("Der Kategoriename darf höchstens 50 Zeichen lang sein.")
    return clean_name, normalized


def _validate_icon(icon_key: str) -> str:
    clean_icon = icon_key.strip()
    if not clean_icon or not is_valid_category_icon(clean_icon):
        raise CategoryServiceError("Dieses Symbol ist nicht zulässig.")
    return clean_icon


def _validate_color(color_key: str) -> str:
    clean_color = color_key.strip()
    if not clean_color or not is_valid_category_color(clean_color):
        raise CategoryServiceError("Diese Farbe ist nicht zulässig.")
    return clean_color


def _owner_filter(user_id: int):
    return Category.user_id == user_id


def _parent_filter(parent_category_id: int | None, user_id: int):
    if parent_category_id is None:
        return Category.parent_category_id.is_(None), _owner_filter(user_id)
    return Category.parent_category_id == parent_category_id, _owner_filter(user_id)


def is_root_category(category: Category) -> bool:
    return category.parent_category_id is None


def is_subcategory(category: Category) -> bool:
    return category.parent_category_id is not None


def get_effective_category_type(db: Session, category: Category) -> CategoryType:
    """Return the root category type, which is authoritative for the hierarchy."""
    if category.parent_category_id is None:
        return category.category_type
    parent = db.get(Category, category.parent_category_id)
    return parent.category_type if parent is not None else category.category_type


def get_active_children(db: Session, category_id: int, *, user_id: int | None = None) -> list[Category]:
    filters = [
        Category.parent_category_id == category_id,
        Category.is_active.is_(True),
    ]
    if user_id is not None:
        filters.append(Category.user_id == user_id)
    return list(
        db.scalars(
            select(Category)
            .where(*filters)
            .order_by(Category.sort_order.asc(), Category.name_normalized.asc(), Category.id.asc())
        )
    )


def can_book_directly(db: Session, category: Category) -> bool:
    if not category.is_active:
        return False
    if is_subcategory(category):
        parent = db.get(Category, category.parent_category_id)
        return bool(parent and parent.is_active)
    return len(get_active_children(db, category.id, user_id=category.user_id)) == 0


def get_category_path(db: Session, category: Category) -> str:
    if category.parent_category_id is None:
        return category.name
    parent = db.get(Category, category.parent_category_id)
    if parent is None:
        return category.name
    return f"{parent.name} > {category.name}"


def get_category_filter_ids(db: Session, category: Category) -> list[int]:
    if category.parent_category_id is not None:
        return [category.id]
    child_ids = list(
        db.scalars(
            select(Category.id).where(
                Category.parent_category_id == category.id,
                Category.user_id == category.user_id,
            )
        )
    )
    return [category.id, *child_ids]


def _validate_parent(
    db: Session,
    *,
    user_id: int,
    parent_category_id: int | None,
    category_id: int | None = None,
) -> Category | None:
    if parent_category_id is None:
        return None
    if category_id is not None and parent_category_id == category_id:
        raise CategoryServiceError("Eine Kategorie kann nicht ihre eigene Oberkategorie sein.")
    parent = db.get(Category, parent_category_id)
    if parent is None:
        raise CategoryServiceError("Oberkategorie nicht gefunden.")
    if parent.user_id != user_id:
        raise CategoryServiceError("Oberkategorie nicht gefunden.")
    if parent.parent_category_id is not None:
        raise CategoryServiceError("Unterkategorien dürfen keine weiteren Unterkategorien besitzen.")
    if not parent.is_active:
        raise CategoryServiceError("Eine inaktive Kategorie kann nicht als Oberkategorie verwendet werden.")
    return parent


def ensure_unique_category_name(
    db: Session,
    name: str,
    user_id: int,
    parent_category_id: int | None = None,
    exclude_category_id: int | None = None,
) -> tuple[str, str]:
    clean_name, normalized = _validate_name(name)
    query = select(Category).where(
        Category.name_normalized == normalized,
        *_parent_filter(parent_category_id, user_id),
    )
    existing = db.scalar(query)
    if existing and existing.id != exclude_category_id:
        raise CategoryServiceError("Dieser Kategoriename ist bereits vorhanden.")
    return clean_name, normalized


def next_sort_order(db: Session, user_id: int, parent_category_id: int | None = None) -> int:
    highest = db.scalar(select(func.max(Category.sort_order)).where(*_parent_filter(parent_category_id, user_id)))
    return int(highest or 0) + 1


def list_categories(db: Session, *, user: User, include_inactive: bool = False) -> list[Category]:
    ensure_default_categories_for_user(db, user_id=user.id)
    query = select(Category).where(Category.user_id == user.id)
    if not include_inactive:
        query = query.where(Category.is_active.is_(True))
    query = query.order_by(
        Category.parent_category_id.asc(),
        Category.sort_order.asc(),
        Category.name_normalized.asc(),
        Category.id.asc(),
    )
    return list(db.scalars(query))


def get_category_by_id(db: Session, category_id: int, *, user_id: int | None = None) -> Category | None:
    category = db.get(Category, category_id)
    if category is None:
        return None
    if user_id is not None and category.user_id != user_id:
        return None
    return category


def create_category(
    db: Session,
    *,
    name: str,
    icon_key: str,
    color_key: str,
    user_id: int,
    parent_category_id: int | None = None,
    sort_order: int | None = None,
    category_type: CategoryType = CategoryType.expense,
) -> Category:
    parent = _validate_parent(db, user_id=user_id, parent_category_id=parent_category_id)
    clean_name, normalized = ensure_unique_category_name(db, name, user_id, parent_category_id)
    clean_icon = _validate_icon(icon_key)
    clean_color = _validate_color(color_key)
    order = sort_order if sort_order is not None else next_sort_order(db, user_id, parent_category_id)
    if order < 1:
        raise CategoryServiceError("Die Sortierung muss bei 1 beginnen.")

    category = Category(
        name=clean_name,
        user_id=user_id,
        name_normalized=normalized,
        icon_key=clean_icon,
        color_key=clean_color,
        parent_category_id=parent_category_id,
        category_type=parent.category_type if parent is not None else category_type,
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
    parent_category_id: int | None | object = _UNSET,
    is_active: bool | None = None,
    category_type: CategoryType | None = None,
) -> Category:
    next_parent_category_id = category.parent_category_id
    if parent_category_id is not _UNSET:
        next_parent_category_id = parent_category_id if isinstance(parent_category_id, int) else None
        next_parent = _validate_parent(
            db,
            user_id=category.user_id,
            parent_category_id=next_parent_category_id,
            category_id=category.id,
        )
        if category.parent_category_id is None and next_parent_category_id is not None:
            has_children = db.scalar(
                select(func.count(Category.id)).where(
                    Category.parent_category_id == category.id,
                    Category.user_id == category.user_id,
                )
            )
            if has_children:
                raise CategoryServiceError("Eine Oberkategorie mit Unterkategorien kann nicht verschoben werden.")
    else:
        next_parent = db.get(Category, next_parent_category_id) if next_parent_category_id is not None else None

    if category_type is not None and next_parent_category_id is not None:
        raise CategoryServiceError("Die Kategorieart wird von der Oberkategorie übernommen.")

    if name is not None:
        clean_name, normalized = ensure_unique_category_name(
            db,
            name,
            category.user_id,
            next_parent_category_id,
            exclude_category_id=category.id,
        )
        category.name = clean_name
        category.name_normalized = normalized

    if icon_key is not None:
        category.icon_key = _validate_icon(icon_key)

    if color_key is not None:
        category.color_key = _validate_color(color_key)

    if category.parent_category_id != next_parent_category_id:
        category.parent_category_id = next_parent_category_id
        category.sort_order = next_sort_order(db, category.user_id, next_parent_category_id)
        if next_parent is not None:
            category.category_type = next_parent.category_type

    if category_type is not None:
        category.category_type = category_type
        for child in db.scalars(
            select(Category).where(
                Category.parent_category_id == category.id,
                Category.user_id == category.user_id,
            )
        ):
            child.category_type = category_type
            child.updated_at = utc_now()

    if is_active is not None:
        category.is_active = is_active
        category.archived_at = None if is_active else utc_now()

    category.updated_at = utc_now()
    db.commit()
    db.refresh(category)
    return category


def reorder_categories(
    db: Session,
    *,
    user_id: int,
    category_ids: list[int],
    parent_category_id: int | None = None,
) -> list[Category]:
    if len(category_ids) != len(set(category_ids)):
        raise CategoryServiceError("Jede Kategorie darf nur einmal sortiert werden.")

    _validate_parent(db, user_id=user_id, parent_category_id=parent_category_id)
    categories = list(
        db.scalars(
            select(Category)
            .where(*_parent_filter(parent_category_id, user_id))
            .order_by(Category.id.asc())
        )
    )
    categories_by_id = {category.id: category for category in categories}
    known_ids = set(categories_by_id)
    requested_ids = set(category_ids)

    if requested_ids - known_ids:
        raise CategoryServiceError("Mindestens eine Kategorie wurde nicht gefunden.")
    if requested_ids != known_ids:
        raise CategoryServiceError("Die Sortierung muss alle Kategorien dieser Ebene enthalten.")

    now = utc_now()
    for index, category_id in enumerate(category_ids, 1):
        category = categories_by_id[category_id]
        category.sort_order = index
        category.updated_at = now

    db.commit()
    return list(db.scalars(select(Category).where(Category.user_id == user_id).order_by(
        Category.parent_category_id.asc(),
        Category.sort_order.asc(),
        Category.name_normalized.asc(),
        Category.id.asc(),
    )))


def delete_category(db: Session, *, category: Category, settings: Settings | None = None) -> None:
    expense_count = int(
        db.scalar(select(func.count(Expense.id)).where(Expense.category_id == category.id)) or 0
    )
    if expense_count:
        raise CategoryServiceError("Kategorien mit Buchungen können nur deaktiviert werden.")
    child_count = int(
        db.scalar(
            select(func.count(Category.id)).where(
                Category.parent_category_id == category.id,
                Category.user_id == category.user_id,
            )
        ) or 0
    )
    if child_count:
        raise CategoryServiceError("Oberkategorien mit Unterkategorien können nicht gelöscht werden.")
    image_path = category.image_path
    image_preview_path = category.image_preview_path
    db.delete(category)
    db.commit()
    delete_category_image_paths(image_path, image_preview_path, settings)


def get_category_catalog() -> dict[str, object]:
    return {
        "icons": [dict(item) for item in CATEGORY_ICONS],
        "colors": [dict(item) for item in CATEGORY_COLORS],
    }


def ensure_default_categories_for_user(db: Session, *, user_id: int) -> tuple[int, int]:
    existing_count = int(
        db.scalar(select(func.count(Category.id)).where(Category.user_id == user_id)) or 0
    )
    if existing_count:
        return 0, existing_count

    created = 0
    existing = 0
    for root_index, item in enumerate(DEFAULT_CATEGORY_STRUCTURE, 1):
        root_name = str(item["name"])
        normalized = normalize_category_name(root_name)
        root = Category(
            name=root_name,
            name_normalized=normalized,
            user_id=user_id,
            icon_key=str(item["icon_key"]),
            color_key=str(item["color_key"]),
            category_type=CategoryType.expense,
            sort_order=root_index,
            is_active=True,
        )
        db.add(root)
        db.flush()
        created += 1
        for child_index, child_name in enumerate(item["children"], 1):
            clean_child_name = str(child_name)
            child = Category(
                name=clean_child_name,
                name_normalized=normalize_category_name(clean_child_name),
                user_id=user_id,
                icon_key=str(item["icon_key"]),
                color_key=str(item["color_key"]),
                category_type=CategoryType.expense,
                parent_category_id=root.id,
                sort_order=child_index,
                is_active=True,
            )
            db.add(child)
            created += 1

    db.commit()
    return created, existing


def seed_default_categories(db: Session, user_id: int | None = None) -> tuple[int, int]:
    if user_id is not None:
        return ensure_default_categories_for_user(db, user_id=user_id)

    user_ids = list(db.scalars(select(User.id).order_by(User.id.asc())))
    created = 0
    existing = 0
    for current_user_id in user_ids:
        user_created, user_existing = ensure_default_categories_for_user(db, user_id=current_user_id)
        created += user_created
        existing += user_existing
    return created, existing

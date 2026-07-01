from app.core.category_icons import CategoryCatalogItem


CATEGORY_COLORS: tuple[CategoryCatalogItem, ...] = (
    {"key": "orange", "label": "Orange"},
    {"key": "green", "label": "Grün"},
    {"key": "blue", "label": "Blau"},
    {"key": "red", "label": "Rot"},
    {"key": "purple", "label": "Violett"},
    {"key": "pink", "label": "Pink"},
    {"key": "teal", "label": "Türkis"},
    {"key": "yellow", "label": "Gelb"},
    {"key": "indigo", "label": "Indigo"},
    {"key": "gray", "label": "Grau"},
)

CATEGORY_COLOR_KEYS = frozenset(item["key"] for item in CATEGORY_COLORS)


def is_valid_category_color(color_key: str) -> bool:
    return color_key in CATEGORY_COLOR_KEYS

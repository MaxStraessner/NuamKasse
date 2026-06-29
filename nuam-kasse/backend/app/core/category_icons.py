from typing import TypedDict


class CategoryCatalogItem(TypedDict):
    key: str
    label: str


CATEGORY_ICONS: tuple[CategoryCatalogItem, ...] = (
    {"key": "utensils", "label": "Essen"},
    {"key": "shopping-cart", "label": "Einkauf"},
    {"key": "heart-pulse", "label": "Gesundheit"},
    {"key": "pill", "label": "Medizin"},
    {"key": "zap", "label": "Strom"},
    {"key": "landmark", "label": "Bank"},
    {"key": "wallet", "label": "Geld"},
    {"key": "gift", "label": "Geschenk"},
    {"key": "plane", "label": "Reise"},
    {"key": "bike", "label": "Motorrad"},
    {"key": "car", "label": "Auto"},
    {"key": "car-taxi-front", "label": "Taxi"},
    {"key": "hotel", "label": "Unterkunft"},
    {"key": "house", "label": "Haushalt"},
    {"key": "cake", "label": "Geburtstag"},
    {"key": "baby", "label": "Baby"},
    {"key": "shirt", "label": "Kleidung"},
    {"key": "school", "label": "Schule"},
    {"key": "fuel", "label": "Tanken"},
    {"key": "phone", "label": "Telefon"},
    {"key": "wifi", "label": "Internet"},
    {"key": "wrench", "label": "Reparatur"},
    {"key": "paw-print", "label": "Haustier"},
    {"key": "coffee", "label": "Cafe"},
    {"key": "bus", "label": "Bus"},
    {"key": "train", "label": "Bahn"},
    {"key": "circle-ellipsis", "label": "Sonstiges"},
)

CATEGORY_ICON_KEYS = frozenset(item["key"] for item in CATEGORY_ICONS)


def is_valid_category_icon(icon_key: str) -> bool:
    return icon_key in CATEGORY_ICON_KEYS

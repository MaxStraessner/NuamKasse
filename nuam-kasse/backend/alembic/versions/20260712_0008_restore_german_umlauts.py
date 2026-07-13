"""Restore German umlauts in seeded category names.

Revision ID: 20260712_0008
Revises: 20260704_0007
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260712_0008"
down_revision: str | None = "20260704_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


NAME_REPLACEMENTS = (
    ("Ernaehrung", "Ernährung"),
    ("Baeckerei", "Bäckerei"),
    ("Getraenke", "Getränke"),
    ("Cafe", "Café"),
    ("Snacks und Suessigkeiten", "Snacks und Süßigkeiten"),
    ("Moebel", "Möbel"),
    ("Kuechengeraete", "Küchengeräte"),
    ("Mobilitaet", "Mobilität"),
    ("Autowaesche", "Autowäsche"),
    ("Ausfluege", "Ausflüge"),
    ("Vereinsbeitraege", "Vereinsbeiträge"),
    ("Koerperpflege", "Körperpflege"),
    ("Buecher", "Bücher"),
    ("Finanzen und Vertraege", "Finanzen und Verträge"),
    ("Bankgebuehren", "Bankgebühren"),
    ("Gebuehren", "Gebühren"),
    ("Zubehoer", "Zubehör"),
    ("Unterstuetzung Familie", "Unterstützung Familie"),
)


def _replace_names(replacements: tuple[tuple[str, str], ...]) -> None:
    connection = op.get_bind()
    statement = sa.text(
        "UPDATE categories SET name = :new_name, name_normalized = :normalized "
        "WHERE name = :old_name"
    )
    for old_name, new_name in replacements:
        connection.execute(
            statement,
            {
                "old_name": old_name,
                "new_name": new_name,
                "normalized": new_name.casefold(),
            },
        )


def upgrade() -> None:
    _replace_names(NAME_REPLACEMENTS)


def downgrade() -> None:
    _replace_names(tuple((new_name, old_name) for old_name, new_name in NAME_REPLACEMENTS))

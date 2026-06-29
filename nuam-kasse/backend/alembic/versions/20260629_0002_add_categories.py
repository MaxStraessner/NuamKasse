"""add categories

Revision ID: 20260629_0002
Revises: 20260629_0001
Create Date: 2026-06-29 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "20260629_0002"
down_revision = "20260629_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("name_normalized", sa.String(length=50), nullable=False),
        sa.Column("icon_key", sa.String(length=40), nullable=False),
        sa.Column("color_key", sa.String(length=30), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_categories_id", "categories", ["id"])
    op.create_index(
        "ix_categories_name_normalized",
        "categories",
        ["name_normalized"],
        unique=True,
    )
    op.create_index("ix_categories_sort_order", "categories", ["sort_order"])
    op.create_index("ix_categories_is_active", "categories", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_categories_is_active", table_name="categories")
    op.drop_index("ix_categories_sort_order", table_name="categories")
    op.drop_index("ix_categories_name_normalized", table_name="categories")
    op.drop_index("ix_categories_id", table_name="categories")
    op.drop_table("categories")

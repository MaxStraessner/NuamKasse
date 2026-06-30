"""add overview expense indexes

Revision ID: 20260629_0005
Revises: 20260629_0004
Create Date: 2026-06-29 18:00:00.000000
"""

from alembic import op


revision = "20260629_0005"
down_revision = "20260629_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_expenses_cash_period_category_voided",
        "expenses",
        ["cash_period_id", "category_id", "is_voided"],
    )
    op.create_index(
        "ix_expenses_cash_period_user_voided",
        "expenses",
        ["cash_period_id", "created_by_user_id", "is_voided"],
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_cash_period_user_voided", table_name="expenses")
    op.drop_index("ix_expenses_cash_period_category_voided", table_name="expenses")

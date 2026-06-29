"""add expenses

Revision ID: 20260629_0004
Revises: 20260629_0003
Create Date: 2026-06-29 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "20260629_0004"
down_revision = "20260629_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cash_period_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="THB"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_voided", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_user_id", sa.Integer(), nullable=True),
        sa.Column("void_reason", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["cash_period_id"], ["cash_periods.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["voided_by_user_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_expenses_id", "expenses", ["id"])
    op.create_index("ix_expenses_cash_period_id", "expenses", ["cash_period_id"])
    op.create_index("ix_expenses_category_id", "expenses", ["category_id"])
    op.create_index("ix_expenses_created_by_user_id", "expenses", ["created_by_user_id"])
    op.create_index("ix_expenses_created_at", "expenses", ["created_at"])
    op.create_index("ix_expenses_is_voided", "expenses", ["is_voided"])
    op.create_index("ix_expenses_voided_by_user_id", "expenses", ["voided_by_user_id"])
    op.create_index(
        "ix_expenses_cash_period_voided_created",
        "expenses",
        ["cash_period_id", "is_voided", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_cash_period_voided_created", table_name="expenses")
    op.drop_index("ix_expenses_voided_by_user_id", table_name="expenses")
    op.drop_index("ix_expenses_is_voided", table_name="expenses")
    op.drop_index("ix_expenses_created_at", table_name="expenses")
    op.drop_index("ix_expenses_created_by_user_id", table_name="expenses")
    op.drop_index("ix_expenses_category_id", table_name="expenses")
    op.drop_index("ix_expenses_cash_period_id", table_name="expenses")
    op.drop_index("ix_expenses_id", table_name="expenses")
    op.drop_table("expenses")

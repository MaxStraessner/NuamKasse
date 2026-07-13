"""add income category and transaction types

Revision ID: 20260713_0009
Revises: 20260712_0008
Create Date: 2026-07-13 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "20260713_0009"
down_revision = "20260712_0008"
branch_labels = None
depends_on = None


CATEGORY_TYPE_CHECK = "category_type IN ('expense', 'income')"
TRANSACTION_TYPE_CHECK = "transaction_type IN ('expense', 'income')"


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("categories", recreate="always") as batch_op:
            batch_op.add_column(
                sa.Column("category_type", sa.String(length=7), nullable=False, server_default="expense")
            )
            batch_op.create_check_constraint("ck_categories_category_type", CATEGORY_TYPE_CHECK)
            batch_op.create_index("ix_categories_category_type", ["category_type"])
        with op.batch_alter_table("expenses", recreate="always") as batch_op:
            batch_op.add_column(
                sa.Column("transaction_type", sa.String(length=7), nullable=False, server_default="expense")
            )
            batch_op.create_check_constraint("ck_expenses_transaction_type", TRANSACTION_TYPE_CHECK)
            batch_op.create_index("ix_expenses_transaction_type", ["transaction_type"])
        return

    op.add_column(
        "categories",
        sa.Column("category_type", sa.String(length=7), nullable=False, server_default="expense"),
    )
    op.create_check_constraint("ck_categories_category_type", "categories", CATEGORY_TYPE_CHECK)
    op.create_index("ix_categories_category_type", "categories", ["category_type"])
    op.add_column(
        "expenses",
        sa.Column("transaction_type", sa.String(length=7), nullable=False, server_default="expense"),
    )
    op.create_check_constraint("ck_expenses_transaction_type", "expenses", TRANSACTION_TYPE_CHECK)
    op.create_index("ix_expenses_transaction_type", "expenses", ["transaction_type"])


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("expenses", recreate="always") as batch_op:
            batch_op.drop_index("ix_expenses_transaction_type")
            batch_op.drop_constraint("ck_expenses_transaction_type", type_="check")
            batch_op.drop_column("transaction_type")
        with op.batch_alter_table("categories", recreate="always") as batch_op:
            batch_op.drop_index("ix_categories_category_type")
            batch_op.drop_constraint("ck_categories_category_type", type_="check")
            batch_op.drop_column("category_type")
        return

    op.drop_index("ix_expenses_transaction_type", table_name="expenses")
    op.drop_constraint("ck_expenses_transaction_type", "expenses", type_="check")
    op.drop_column("expenses", "transaction_type")
    op.drop_index("ix_categories_category_type", table_name="categories")
    op.drop_constraint("ck_categories_category_type", "categories", type_="check")
    op.drop_column("categories", "category_type")

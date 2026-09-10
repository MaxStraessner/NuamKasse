"""add multiple cashbooks and immutable period closing totals

Revision ID: 20260908_0012
Revises: 20260825_0011
Create Date: 2026-09-08 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_0012"
down_revision = "20260825_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cashbooks") as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))

    with op.batch_alter_table("cashbook_memberships") as batch_op:
        batch_op.drop_constraint("uq_cashbook_memberships_user_id", type_="unique")

    with op.batch_alter_table("cash_periods") as batch_op:
        batch_op.add_column(sa.Column("closed_opening_amount", sa.Numeric(14, 2), nullable=True))
        batch_op.add_column(sa.Column("closed_income_amount", sa.Numeric(14, 2), nullable=True))
        batch_op.add_column(sa.Column("closed_expense_amount", sa.Numeric(14, 2), nullable=True))
        batch_op.add_column(sa.Column("closed_balance_amount", sa.Numeric(14, 2), nullable=True))
        batch_op.add_column(sa.Column("closed_booking_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cash_periods") as batch_op:
        batch_op.drop_column("closed_booking_count")
        batch_op.drop_column("closed_balance_amount")
        batch_op.drop_column("closed_expense_amount")
        batch_op.drop_column("closed_income_amount")
        batch_op.drop_column("closed_opening_amount")

    with op.batch_alter_table("cashbook_memberships") as batch_op:
        batch_op.create_unique_constraint("uq_cashbook_memberships_user_id", ["user_id"])

    with op.batch_alter_table("cashbooks") as batch_op:
        batch_op.drop_column("description")

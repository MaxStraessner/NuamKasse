"""add a separate booking date to expenses

Revision ID: 20260918_0014
Revises: 20260910_0013
Create Date: 2026-09-18 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260918_0014"
down_revision = "20260910_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("expenses") as batch_op:
        batch_op.add_column(sa.Column("booking_date", sa.Date(), nullable=True))

    # Preserve the business calendar day for legacy rows while keeping SQLite migrations portable.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            sa.text(
                "UPDATE expenses "
                "SET booking_date = (created_at AT TIME ZONE 'Asia/Bangkok')::date "
                "WHERE booking_date IS NULL"
            )
        )
    else:
        op.execute(sa.text("UPDATE expenses SET booking_date = DATE(created_at) WHERE booking_date IS NULL"))

    with op.batch_alter_table("expenses") as batch_op:
        batch_op.alter_column("booking_date", existing_type=sa.Date(), nullable=False)
        batch_op.create_index("ix_expenses_booking_date", ["booking_date"], unique=False)
        batch_op.create_index(
            "ix_expenses_cash_period_voided_booking",
            ["cash_period_id", "is_voided", "booking_date"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("expenses") as batch_op:
        batch_op.drop_index("ix_expenses_cash_period_voided_booking")
        batch_op.drop_index("ix_expenses_booking_date")
        batch_op.drop_column("booking_date")

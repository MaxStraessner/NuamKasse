"""add cash periods

Revision ID: 20260629_0003
Revises: 20260629_0002
Create Date: 2026-06-29 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "20260629_0003"
down_revision = "20260629_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cash_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("opening_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="THB"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "closed", name="cashperiodstatus", native_enum=False),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("closed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["closed_by_user_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_cash_periods_id", "cash_periods", ["id"])
    op.create_index("ix_cash_periods_status", "cash_periods", ["status"])
    op.create_index("ix_cash_periods_start_date", "cash_periods", ["start_date"])
    op.create_index("ix_cash_periods_created_by_user_id", "cash_periods", ["created_by_user_id"])
    op.create_index("ix_cash_periods_closed_by_user_id", "cash_periods", ["closed_by_user_id"])
    op.create_index(
        "uq_cash_periods_active",
        "cash_periods",
        ["status"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_cash_periods_active", table_name="cash_periods")
    op.drop_index("ix_cash_periods_closed_by_user_id", table_name="cash_periods")
    op.drop_index("ix_cash_periods_created_by_user_id", table_name="cash_periods")
    op.drop_index("ix_cash_periods_start_date", table_name="cash_periods")
    op.drop_index("ix_cash_periods_status", table_name="cash_periods")
    op.drop_index("ix_cash_periods_id", table_name="cash_periods")
    op.drop_table("cash_periods")

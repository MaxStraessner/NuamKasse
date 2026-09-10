"""add administrator audit and period access controls

Revision ID: 20260910_0013
Revises: 20260908_0012
Create Date: 2026-09-10 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260910_0013"
down_revision = "20260908_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cashbook_memberships") as batch_op:
        batch_op.add_column(
            sa.Column(
                "period_access_mode",
                sa.String(length=32),
                nullable=False,
                server_default="all",
            )
        )
        batch_op.add_column(sa.Column("period_access_from", sa.Date(), nullable=True))

    op.create_table(
        "cash_period_permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("membership_id", sa.Integer(), nullable=False),
        sa.Column("cash_period_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["membership_id"],
            ["cashbook_memberships.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["cash_period_id"],
            ["cash_periods.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "membership_id",
            "cash_period_id",
            name="uq_cash_period_permissions_membership_period",
        ),
    )
    op.create_index(
        "ix_cash_period_permissions_membership_id",
        "cash_period_permissions",
        ["membership_id"],
    )
    op.create_index(
        "ix_cash_period_permissions_cash_period_id",
        "cash_period_permissions",
        ["cash_period_id"],
    )

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_logs_actor_user_id", "admin_audit_logs", ["actor_user_id"])
    op.create_index("ix_admin_audit_logs_target_user_id", "admin_audit_logs", ["target_user_id"])
    op.create_index("ix_admin_audit_logs_created_at", "admin_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_admin_audit_logs_created_at", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_target_user_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_actor_user_id", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")

    op.drop_index("ix_cash_period_permissions_cash_period_id", table_name="cash_period_permissions")
    op.drop_index("ix_cash_period_permissions_membership_id", table_name="cash_period_permissions")
    op.drop_table("cash_period_permissions")

    with op.batch_alter_table("cashbook_memberships") as batch_op:
        batch_op.drop_column("period_access_from")
        batch_op.drop_column("period_access_mode")

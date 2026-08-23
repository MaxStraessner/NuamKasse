"""add shared cashbooks and memberships

Revision ID: 20260822_0010
Revises: 20260713_0009
Create Date: 2026-08-22 12:00:00.000000
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "20260822_0010"
down_revision = "20260713_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cashbooks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="THB"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_cashbooks_id", "cashbooks", ["id"])
    op.create_index("ix_cashbooks_created_by_user_id", "cashbooks", ["created_by_user_id"])

    op.create_table(
        "cashbook_memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cashbook_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "member", name="cashbookrole", native_enum=False),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["cashbook_id"], ["cashbooks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("cashbook_id", "user_id", name="uq_cashbook_memberships_cashbook_user"),
        sa.UniqueConstraint("user_id", name="uq_cashbook_memberships_user_id"),
    )
    op.create_index("ix_cashbook_memberships_id", "cashbook_memberships", ["id"])
    op.create_index("ix_cashbook_memberships_cashbook_id", "cashbook_memberships", ["cashbook_id"])
    op.create_index("ix_cashbook_memberships_user_id", "cashbook_memberships", ["user_id"])
    op.create_index(
        "ix_cashbook_memberships_cashbook_role",
        "cashbook_memberships",
        ["cashbook_id", "role"],
    )

    op.drop_index("uq_cash_periods_active", table_name="cash_periods")
    with op.batch_alter_table("cash_periods") as batch_op:
        batch_op.add_column(sa.Column("cashbook_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_cash_periods_cashbook_id_cashbooks",
            "cashbooks",
            ["cashbook_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_cash_periods_cashbook_id", ["cashbook_id"])

    with op.batch_alter_table("categories") as batch_op:
        batch_op.add_column(sa.Column("cashbook_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_categories_cashbook_id_cashbooks",
            "cashbooks",
            ["cashbook_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_categories_cashbook_id", ["cashbook_id"])

    with op.batch_alter_table("expenses") as batch_op:
        batch_op.add_column(sa.Column("note", sa.String(length=500), nullable=True))

    connection = op.get_bind()
    users = connection.execute(
        sa.text("SELECT id, role, is_active FROM users ORDER BY id")
    ).mappings().all()
    if users:
        admin = next(
            (user for user in users if user["role"] == "admin" and user["is_active"]),
            next((user for user in users if user["role"] == "admin"), users[0]),
        )
        currency = connection.execute(
            sa.text(
                "SELECT currency FROM cash_periods "
                "ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC LIMIT 1"
            )
        ).scalar_one_or_none() or "THB"
        now = datetime.now(timezone.utc)
        cashbooks = sa.table(
            "cashbooks",
            sa.column("id", sa.Integer()),
            sa.column("name", sa.String()),
            sa.column("currency", sa.String()),
            sa.column("created_by_user_id", sa.Integer()),
            sa.column("created_at", sa.DateTime(timezone=True)),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        )
        connection.execute(
            cashbooks.insert().values(
                name="Nuam Kasse",
                currency=currency,
                created_by_user_id=admin["id"],
                created_at=now,
                updated_at=now,
            )
        )
        cashbook_id = connection.execute(
            sa.text("SELECT MAX(id) FROM cashbooks")
        ).scalar_one()
        memberships = sa.table(
            "cashbook_memberships",
            sa.column("cashbook_id", sa.Integer()),
            sa.column("user_id", sa.Integer()),
            sa.column("role", sa.String()),
            sa.column("created_at", sa.DateTime(timezone=True)),
        )
        connection.execute(
            memberships.insert(),
            [
                {
                    "cashbook_id": cashbook_id,
                    "user_id": user["id"],
                    "role": "admin" if user["id"] == admin["id"] else "member",
                    "created_at": now,
                }
                for user in users
            ],
        )
        connection.execute(
            sa.text("UPDATE cash_periods SET cashbook_id = :cashbook_id"),
            {"cashbook_id": cashbook_id},
        )
        connection.execute(
            sa.text("UPDATE categories SET cashbook_id = :cashbook_id"),
            {"cashbook_id": cashbook_id},
        )

    with op.batch_alter_table("cash_periods") as batch_op:
        batch_op.alter_column("cashbook_id", existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("categories") as batch_op:
        batch_op.alter_column("cashbook_id", existing_type=sa.Integer(), nullable=False)

    op.create_index(
        "uq_cash_periods_active",
        "cash_periods",
        ["cashbook_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_cash_periods_active", table_name="cash_periods")
    with op.batch_alter_table("expenses") as batch_op:
        batch_op.drop_column("note")
    with op.batch_alter_table("categories") as batch_op:
        batch_op.drop_index("ix_categories_cashbook_id")
        batch_op.drop_constraint("fk_categories_cashbook_id_cashbooks", type_="foreignkey")
        batch_op.drop_column("cashbook_id")
    with op.batch_alter_table("cash_periods") as batch_op:
        batch_op.drop_index("ix_cash_periods_cashbook_id")
        batch_op.drop_constraint("fk_cash_periods_cashbook_id_cashbooks", type_="foreignkey")
        batch_op.drop_column("cashbook_id")
    op.create_index(
        "uq_cash_periods_active",
        "cash_periods",
        ["status"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )
    op.drop_index("ix_cashbook_memberships_cashbook_role", table_name="cashbook_memberships")
    op.drop_index("ix_cashbook_memberships_user_id", table_name="cashbook_memberships")
    op.drop_index("ix_cashbook_memberships_cashbook_id", table_name="cashbook_memberships")
    op.drop_index("ix_cashbook_memberships_id", table_name="cashbook_memberships")
    op.drop_table("cashbook_memberships")
    op.drop_index("ix_cashbooks_created_by_user_id", table_name="cashbooks")
    op.drop_index("ix_cashbooks_id", table_name="cashbooks")
    op.drop_table("cashbooks")

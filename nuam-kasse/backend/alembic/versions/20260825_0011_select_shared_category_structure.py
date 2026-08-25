"""select one preserved category structure per shared cashbook

Revision ID: 20260825_0011
Revises: 20260822_0010
Create Date: 2026-08-25 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260825_0011"
down_revision = "20260822_0010"
branch_labels = None
depends_on = None


def _best_category_owner(connection, cashbook_id: int, *, admins_only: bool) -> int | None:
    role_filter = "AND u.role = 'admin'" if admins_only else ""
    return connection.execute(
        sa.text(
            f"""
            SELECT c.user_id
            FROM categories c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN expenses e ON e.category_id = c.id
            WHERE c.cashbook_id = :cashbook_id
              AND c.user_id IS NOT NULL
              {role_filter}
            GROUP BY c.user_id
            ORDER BY
              COUNT(DISTINCT CASE
                WHEN c.image_path IS NOT NULL OR c.image_preview_path IS NOT NULL THEN c.id
              END) DESC,
              COUNT(DISTINCT e.id) DESC,
              COUNT(DISTINCT c.id) DESC,
              c.user_id ASC
            LIMIT 1
            """
        ),
        {"cashbook_id": cashbook_id},
    ).scalar_one_or_none()


def upgrade() -> None:
    with op.batch_alter_table("cashbooks") as batch_op:
        batch_op.add_column(sa.Column("category_owner_user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_cashbooks_category_owner_user_id_users",
            "users",
            ["category_owner_user_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index(
            "ix_cashbooks_category_owner_user_id",
            ["category_owner_user_id"],
        )

    connection = op.get_bind()
    cashbooks = connection.execute(
        sa.text("SELECT id, created_by_user_id FROM cashbooks ORDER BY id")
    ).mappings().all()
    for cashbook in cashbooks:
        owner_id = _best_category_owner(
            connection,
            cashbook["id"],
            admins_only=True,
        )
        if owner_id is None:
            owner_id = _best_category_owner(
                connection,
                cashbook["id"],
                admins_only=False,
            )
        if owner_id is None:
            owner_id = cashbook["created_by_user_id"]
        if owner_id is None:
            owner_id = connection.execute(
                sa.text(
                    "SELECT user_id FROM cashbook_memberships "
                    "WHERE cashbook_id = :cashbook_id "
                    "ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, user_id LIMIT 1"
                ),
                {"cashbook_id": cashbook["id"]},
            ).scalar_one_or_none()
        if owner_id is None:
            raise RuntimeError(
                f"Cashbook {cashbook['id']} has no user who can own its category structure."
            )
        connection.execute(
            sa.text(
                "UPDATE cashbooks SET category_owner_user_id = :owner_id WHERE id = :cashbook_id"
            ),
            {"owner_id": owner_id, "cashbook_id": cashbook["id"]},
        )

    with op.batch_alter_table("cashbooks") as batch_op:
        batch_op.alter_column(
            "category_owner_user_id",
            existing_type=sa.Integer(),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("cashbooks") as batch_op:
        batch_op.drop_index("ix_cashbooks_category_owner_user_id")
        batch_op.drop_constraint(
            "fk_cashbooks_category_owner_user_id_users",
            type_="foreignkey",
        )
        batch_op.drop_column("category_owner_user_id")

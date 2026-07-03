"""add category hierarchy

Revision ID: 20260703_0006
Revises: 20260629_0005
Create Date: 2026-07-03 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "20260703_0006"
down_revision = "20260629_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("categories", recreate="always") as batch_op:
            batch_op.drop_index("ix_categories_name_normalized")
            batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
            batch_op.add_column(sa.Column("parent_category_id", sa.Integer(), nullable=True))
            batch_op.add_column(sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
            batch_op.create_foreign_key(
                "fk_categories_user_id_users",
                "users",
                ["user_id"],
                ["id"],
                ondelete="RESTRICT",
            )
            batch_op.create_foreign_key(
                "fk_categories_parent_category_id_categories",
                "categories",
                ["parent_category_id"],
                ["id"],
                ondelete="RESTRICT",
            )
            batch_op.create_check_constraint(
                "ck_categories_not_self_parent",
                "parent_category_id IS NULL OR parent_category_id != id",
            )
            batch_op.create_index("ix_categories_name_normalized", ["name_normalized"], unique=False)
            batch_op.create_index("ix_categories_parent_category_id", ["parent_category_id"])
            batch_op.create_index("ix_categories_parent_sort", ["parent_category_id", "sort_order"])
            batch_op.create_index("ix_categories_active_parent", ["is_active", "parent_category_id"])
            batch_op.create_index("ix_categories_user_id", ["user_id"])
            batch_op.create_index("ix_categories_user_parent", ["user_id", "parent_category_id"])
            batch_op.create_index("ix_categories_user_active", ["user_id", "is_active"])
        op.execute(
            """
            UPDATE categories
            SET user_id = (
                SELECT id
                FROM users
                ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id
                LIMIT 1
            )
            WHERE user_id IS NULL
            """
        )
        return

    op.drop_index("ix_categories_name_normalized", table_name="categories")
    op.add_column("categories", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("categories", sa.Column("parent_category_id", sa.Integer(), nullable=True))
    op.add_column("categories", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_categories_user_id_users",
        "categories",
        "users",
        ["user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_categories_parent_category_id_categories",
        "categories",
        "categories",
        ["parent_category_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_categories_not_self_parent",
        "categories",
        "parent_category_id IS NULL OR parent_category_id != id",
    )
    op.create_index("ix_categories_name_normalized", "categories", ["name_normalized"], unique=False)
    op.create_index("ix_categories_parent_category_id", "categories", ["parent_category_id"])
    op.create_index("ix_categories_parent_sort", "categories", ["parent_category_id", "sort_order"])
    op.create_index("ix_categories_active_parent", "categories", ["is_active", "parent_category_id"])
    op.create_index("ix_categories_user_id", "categories", ["user_id"])
    op.create_index("ix_categories_user_parent", "categories", ["user_id", "parent_category_id"])
    op.create_index("ix_categories_user_active", "categories", ["user_id", "is_active"])
    op.execute(
        """
        UPDATE categories
        SET user_id = (
            SELECT id
            FROM users
            ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id
            LIMIT 1
        )
        WHERE user_id IS NULL
        """
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("categories", recreate="always") as batch_op:
            batch_op.drop_index("ix_categories_user_active")
            batch_op.drop_index("ix_categories_user_parent")
            batch_op.drop_index("ix_categories_user_id")
            batch_op.drop_index("ix_categories_active_parent")
            batch_op.drop_index("ix_categories_parent_sort")
            batch_op.drop_index("ix_categories_parent_category_id")
            batch_op.drop_index("ix_categories_name_normalized")
            batch_op.drop_constraint("ck_categories_not_self_parent", type_="check")
            batch_op.drop_constraint("fk_categories_parent_category_id_categories", type_="foreignkey")
            batch_op.drop_constraint("fk_categories_user_id_users", type_="foreignkey")
            batch_op.drop_column("archived_at")
            batch_op.drop_column("parent_category_id")
            batch_op.drop_column("user_id")
            batch_op.create_index("ix_categories_name_normalized", ["name_normalized"], unique=True)
        return

    op.drop_index("ix_categories_user_active", table_name="categories")
    op.drop_index("ix_categories_user_parent", table_name="categories")
    op.drop_index("ix_categories_user_id", table_name="categories")
    op.drop_index("ix_categories_active_parent", table_name="categories")
    op.drop_index("ix_categories_parent_sort", table_name="categories")
    op.drop_index("ix_categories_parent_category_id", table_name="categories")
    op.drop_index("ix_categories_name_normalized", table_name="categories")
    op.drop_constraint("ck_categories_not_self_parent", "categories", type_="check")
    op.drop_constraint("fk_categories_parent_category_id_categories", "categories", type_="foreignkey")
    op.drop_constraint("fk_categories_user_id_users", "categories", type_="foreignkey")
    op.drop_column("categories", "archived_at")
    op.drop_column("categories", "parent_category_id")
    op.drop_column("categories", "user_id")
    op.create_index("ix_categories_name_normalized", "categories", ["name_normalized"], unique=True)

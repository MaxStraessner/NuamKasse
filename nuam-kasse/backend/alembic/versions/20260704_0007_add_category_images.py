"""add category image fields

Revision ID: 20260704_0007
Revises: 20260703_0006
Create Date: 2026-07-04 12:00:00.000000
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260704_0007"
down_revision: str | None = "20260703_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("categories") as batch_op:
        batch_op.add_column(sa.Column("image_path", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("image_preview_path", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("image_original_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("image_mime_type", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("image_size", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("image_width", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("image_height", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("image_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("categories") as batch_op:
        batch_op.drop_column("image_updated_at")
        batch_op.drop_column("image_height")
        batch_op.drop_column("image_width")
        batch_op.drop_column("image_size")
        batch_op.drop_column("image_mime_type")
        batch_op.drop_column("image_original_name")
        batch_op.drop_column("image_preview_path")
        batch_op.drop_column("image_path")

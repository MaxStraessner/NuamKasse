import enum
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utc_now


class CategoryType(str, enum.Enum):
    expense = "expense"
    income = "income"


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("parent_category_id IS NULL OR parent_category_id != id", name="ck_categories_not_self_parent"),
        Index("ix_categories_parent_category_id", "parent_category_id"),
        Index("ix_categories_parent_sort", "parent_category_id", "sort_order"),
        Index("ix_categories_active_parent", "is_active", "parent_category_id"),
        Index("ix_categories_user_id", "user_id"),
        Index("ix_categories_user_parent", "user_id", "parent_category_id"),
        Index("ix_categories_user_active", "user_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    name_normalized: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    icon_key: Mapped[str] = mapped_column(String(40), nullable=False)
    color_key: Mapped[str] = mapped_column(String(30), nullable=False)
    category_type: Mapped[CategoryType] = mapped_column(
        Enum(CategoryType, native_enum=False),
        nullable=False,
        default=CategoryType.expense,
        index=True,
    )
    image_path: Mapped[str] = mapped_column(String(500), nullable=True)
    image_preview_path: Mapped[str] = mapped_column(String(500), nullable=True)
    image_original_name: Mapped[str] = mapped_column(String(255), nullable=True)
    image_mime_type: Mapped[str] = mapped_column(String(80), nullable=True)
    image_size: Mapped[int] = mapped_column(Integer, nullable=True)
    image_width: Mapped[int] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int] = mapped_column(Integer, nullable=True)
    image_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")

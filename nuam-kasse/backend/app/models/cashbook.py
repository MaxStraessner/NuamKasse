import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utc_now


class CashbookRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class PeriodAccessMode(str, enum.Enum):
    all = "all"
    selected = "selected"
    current_and_future = "current_and_future"


class Cashbook(Base):
    __tablename__ = "cashbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="THB")
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    category_owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    created_by = relationship("User", foreign_keys=[created_by_user_id])
    category_owner = relationship("User", foreign_keys=[category_owner_user_id])
    memberships = relationship(
        "CashbookMembership", back_populates="cashbook", cascade="all, delete-orphan"
    )


class CashbookMembership(Base):
    __tablename__ = "cashbook_memberships"
    __table_args__ = (
        UniqueConstraint("cashbook_id", "user_id", name="uq_cashbook_memberships_cashbook_user"),
        Index("ix_cashbook_memberships_cashbook_role", "cashbook_id", "role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cashbook_id: Mapped[int] = mapped_column(
        ForeignKey("cashbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[CashbookRole] = mapped_column(
        Enum(CashbookRole, native_enum=False), nullable=False, default=CashbookRole.member
    )
    period_access_mode: Mapped[PeriodAccessMode] = mapped_column(
        Enum(PeriodAccessMode, native_enum=False),
        nullable=False,
        default=PeriodAccessMode.all,
        server_default=PeriodAccessMode.all.value,
    )
    period_access_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    cashbook = relationship("Cashbook", back_populates="memberships")
    user = relationship("User", back_populates="cashbook_memberships")
    period_permissions = relationship(
        "CashPeriodPermission",
        back_populates="membership",
        cascade="all, delete-orphan",
    )

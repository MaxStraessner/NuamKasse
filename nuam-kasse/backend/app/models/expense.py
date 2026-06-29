from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utc_now


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_cash_period_voided_created", "cash_period_id", "is_voided", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cash_period_id: Mapped[int] = mapped_column(
        ForeignKey("cash_periods.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="THB")
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
    )
    is_voided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    voided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    void_reason: Mapped[str] = mapped_column(String(200), nullable=True)

    cash_period = relationship("CashPeriod")
    category = relationship("Category")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    voided_by = relationship("User", foreign_keys=[voided_by_user_id])

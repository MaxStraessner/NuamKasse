from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utc_now


class CashPeriodPermission(Base):
    __tablename__ = "cash_period_permissions"
    __table_args__ = (
        UniqueConstraint(
            "membership_id",
            "cash_period_id",
            name="uq_cash_period_permissions_membership_period",
        ),
        Index("ix_cash_period_permissions_membership_id", "membership_id"),
        Index("ix_cash_period_permissions_cash_period_id", "cash_period_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    membership_id: Mapped[int] = mapped_column(
        ForeignKey("cashbook_memberships.id", ondelete="CASCADE"),
        nullable=False,
    )
    cash_period_id: Mapped[int] = mapped_column(
        ForeignKey("cash_periods.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    membership = relationship("CashbookMembership", back_populates="period_permissions")
    cash_period = relationship("CashPeriod")

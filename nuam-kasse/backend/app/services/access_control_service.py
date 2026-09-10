from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.access_control import CashPeriodPermission
from app.models.cashbook import CashbookMembership, PeriodAccessMode
from app.models.cash_period import CashPeriod, CashPeriodStatus


def membership_can_access_cash_period(
    db: Session,
    membership: CashbookMembership,
    cash_period: CashPeriod,
) -> bool:
    if cash_period.cashbook_id != membership.cashbook_id:
        return False
    if membership.period_access_mode == PeriodAccessMode.all:
        return True
    if membership.period_access_mode == PeriodAccessMode.current_and_future:
        return (
            membership.period_access_from is not None
            and cash_period.start_date >= membership.period_access_from
        )
    permission = db.scalar(
        select(CashPeriodPermission.id).where(
            CashPeriodPermission.membership_id == membership.id,
            CashPeriodPermission.cash_period_id == cash_period.id,
        )
    )
    return permission is not None


def accessible_period_ids(
    db: Session,
    membership: CashbookMembership,
    periods: list[CashPeriod] | None = None,
) -> list[int]:
    available = periods
    if available is None:
        available = list(
            db.scalars(
                select(CashPeriod)
                .where(CashPeriod.cashbook_id == membership.cashbook_id)
                .order_by(CashPeriod.start_date.desc(), CashPeriod.id.desc())
            )
        )
    return [period.id for period in available if membership_can_access_cash_period(db, membership, period)]


def current_and_future_boundary(db: Session, cashbook_id: int) -> date:
    active_period = db.scalar(
        select(CashPeriod).where(
            CashPeriod.cashbook_id == cashbook_id,
            CashPeriod.status == CashPeriodStatus.active,
        )
    )
    return active_period.start_date if active_period is not None else date.today()

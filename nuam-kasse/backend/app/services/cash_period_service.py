from datetime import date
from decimal import Decimal

from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.money import MoneyError, format_money, parse_money, validate_currency
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.user import User, utc_now


class CashPeriodServiceError(ValueError):
    def __init__(self, message: str, *, code: str = "cash_period_error", conflict: bool = False):
        super().__init__(message)
        self.message = message
        self.code = code
        self.conflict = conflict


_UNSET = object()


def _validate_name(name: str) -> str:
    clean_name = name.strip()
    if not clean_name:
        raise CashPeriodServiceError("Der Name der Kassenperiode darf nicht leer sein.")
    if len(clean_name) > 80:
        raise CashPeriodServiceError("Der Name der Kassenperiode darf hoechstens 80 Zeichen lang sein.")
    return clean_name


def _validate_dates(start_date: date, end_date: date | None) -> None:
    if end_date is not None and end_date < start_date:
        raise CashPeriodServiceError("Das Enddatum darf nicht vor dem Startdatum liegen.")


def _active_cash_period_query():
    return select(CashPeriod).where(CashPeriod.status == CashPeriodStatus.active)


def get_active_cash_period(db: Session) -> CashPeriod | None:
    return db.scalar(_active_cash_period_query())


def get_cash_period_by_id(db: Session, cash_period_id: int) -> CashPeriod | None:
    return db.get(CashPeriod, cash_period_id)


def list_cash_periods(
    db: Session,
    *,
    status_filter: CashPeriodStatus | None = None,
) -> list[CashPeriod]:
    query = select(CashPeriod)
    if status_filter is not None:
        query = query.where(CashPeriod.status == status_filter)
    query = query.order_by(
        case((CashPeriod.status == CashPeriodStatus.active, 0), else_=1).asc(),
        CashPeriod.start_date.desc(),
        CashPeriod.id.desc(),
    )
    return list(db.scalars(query))


def create_cash_period(
    db: Session,
    *,
    name: str,
    opening_amount: str | Decimal,
    currency: str,
    start_date: date,
    end_date: date | None,
    created_by: User,
) -> CashPeriod:
    if get_active_cash_period(db) is not None:
        raise CashPeriodServiceError(
            "Es existiert bereits eine aktive Kassenperiode.",
            code="active_cash_period_exists",
            conflict=True,
        )
    clean_name = _validate_name(name)
    try:
        amount = parse_money(opening_amount)
        clean_currency = validate_currency(currency)
    except MoneyError as exc:
        raise CashPeriodServiceError(str(exc)) from exc
    _validate_dates(start_date, end_date)

    cash_period = CashPeriod(
        name=clean_name,
        opening_amount=amount,
        currency=clean_currency,
        start_date=start_date,
        end_date=end_date,
        status=CashPeriodStatus.active,
        created_by_user_id=created_by.id,
    )
    db.add(cash_period)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CashPeriodServiceError(
            "Es existiert bereits eine aktive Kassenperiode.",
            code="active_cash_period_exists",
            conflict=True,
        ) from exc
    db.refresh(cash_period)
    return cash_period


def update_cash_period(
    db: Session,
    cash_period: CashPeriod,
    *,
    name: str | None = None,
    opening_amount: str | Decimal | None = None,
    start_date: date | None = None,
    end_date: date | None | object = _UNSET,
) -> CashPeriod:
    if cash_period.status == CashPeriodStatus.closed:
        raise CashPeriodServiceError(
            "Eine abgeschlossene Kassenperiode kann nicht mehr veraendert werden.",
            code="cash_period_closed",
            conflict=True,
        )

    target_start = start_date if start_date is not None else cash_period.start_date
    target_end = cash_period.end_date if end_date is _UNSET else end_date
    _validate_dates(target_start, target_end)

    if name is not None:
        cash_period.name = _validate_name(name)
    if opening_amount is not None:
        try:
            cash_period.opening_amount = parse_money(opening_amount)
        except MoneyError as exc:
            raise CashPeriodServiceError(str(exc)) from exc
    if start_date is not None:
        cash_period.start_date = start_date
    if end_date is not _UNSET:
        cash_period.end_date = end_date

    cash_period.updated_at = utc_now()
    db.commit()
    db.refresh(cash_period)
    return cash_period


def close_cash_period(
    db: Session,
    cash_period: CashPeriod,
    *,
    closed_by: User,
    end_date: date | None = None,
) -> CashPeriod:
    if cash_period.status == CashPeriodStatus.closed:
        raise CashPeriodServiceError(
            "Eine abgeschlossene Kassenperiode kann nicht erneut abgeschlossen werden.",
            code="cash_period_closed",
            conflict=True,
        )

    close_date = end_date or date.today()
    _validate_dates(cash_period.start_date, close_date)
    now = utc_now()
    cash_period.end_date = close_date
    cash_period.status = CashPeriodStatus.closed
    cash_period.closed_at = now
    cash_period.closed_by_user_id = closed_by.id
    cash_period.updated_at = now
    db.commit()
    db.refresh(cash_period)
    return cash_period


def get_cash_period_summary(cash_period: CashPeriod) -> dict[str, object]:
    opening_amount = format_money(cash_period.opening_amount)
    return {
        "cash_period_id": cash_period.id,
        "name": cash_period.name,
        "opening_amount": opening_amount,
        "spent_amount": "0.00",
        "remaining_amount": opening_amount,
        "currency": cash_period.currency,
        "status": cash_period.status,
    }

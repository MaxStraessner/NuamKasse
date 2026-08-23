from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.money import MoneyError, parse_money, validate_currency
from app.models.cashbook import Cashbook
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.user import User, utc_now
from app.services.cash_summary_service import get_cash_period_summary


class CashPeriodServiceError(ValueError):
    def __init__(self, message: str, *, code: str = "cash_period_error", conflict: bool = False):
        super().__init__(message)
        self.message = message
        self.code = code
        self.conflict = conflict


_UNSET = object()
GERMAN_MONTHS = (
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)


def _validate_name(name: str) -> str:
    clean_name = name.strip()
    if not clean_name:
        raise CashPeriodServiceError("Der Name der Kassenperiode darf nicht leer sein.")
    if len(clean_name) > 80:
        raise CashPeriodServiceError("Der Name der Kassenperiode darf höchstens 80 Zeichen lang sein.")
    return clean_name


def _validate_dates(start_date: date, end_date: date | None) -> None:
    if end_date is not None and end_date < start_date:
        raise CashPeriodServiceError("Das Enddatum darf nicht vor dem Startdatum liegen.")


def _active_cash_period_query(cashbook_id: int):
    return select(CashPeriod).where(
        CashPeriod.cashbook_id == cashbook_id,
        CashPeriod.status == CashPeriodStatus.active,
    )


def get_active_cash_period(
    db: Session, cashbook_id: int, *, for_update: bool = False
) -> CashPeriod | None:
    query = _active_cash_period_query(cashbook_id)
    if for_update:
        query = query.with_for_update()
    return db.scalar(query)


def get_cash_period_by_id(
    db: Session, cash_period_id: int, *, cashbook_id: int
) -> CashPeriod | None:
    return db.scalar(
        select(CashPeriod).where(
            CashPeriod.id == cash_period_id,
            CashPeriod.cashbook_id == cashbook_id,
        )
    )


def list_cash_periods(
    db: Session,
    *,
    cashbook_id: int,
    status_filter: CashPeriodStatus | None = None,
) -> list[CashPeriod]:
    query = select(CashPeriod).where(CashPeriod.cashbook_id == cashbook_id)
    if status_filter is not None:
        query = query.where(CashPeriod.status == status_filter)
    query = query.order_by(
        case((CashPeriod.status == CashPeriodStatus.active, 0), else_=1).asc(),
        CashPeriod.start_date.desc(),
        CashPeriod.id.desc(),
    )
    return list(db.scalars(query))


def list_cash_periods_with_summaries(
    db: Session,
    *,
    cashbook_id: int,
    status_filter: CashPeriodStatus | None = None,
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for cash_period in list_cash_periods(
        db, cashbook_id=cashbook_id, status_filter=status_filter
    ):
        summary = get_cash_period_summary(db, cash_period)
        result.append(
            {
                "cash_period": cash_period,
                "income_amount": summary["income_amount"],
                "spent_amount": summary["spent_amount"],
                "net_amount": summary["net_amount"],
                "remaining_amount": summary["remaining_amount"],
                "transaction_count": summary["active_expense_count"],
            }
        )
    return result


def create_cash_period(
    db: Session,
    *,
    cashbook: Cashbook,
    name: str,
    opening_amount: str | Decimal,
    currency: str,
    start_date: date,
    end_date: date | None,
    created_by: User,
) -> CashPeriod:
    db.scalar(select(Cashbook).where(Cashbook.id == cashbook.id).with_for_update())
    if get_active_cash_period(db, cashbook.id) is not None:
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
    if clean_currency != cashbook.currency:
        raise CashPeriodServiceError("Die Währung muss der Währung der Kasse entsprechen.")
    _validate_dates(start_date, end_date)

    cash_period = CashPeriod(
        cashbook_id=cashbook.id,
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
            "Eine abgeschlossene Kassenperiode kann nicht mehr verändert werden.",
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


def _next_period_start(close_date: date) -> date:
    today = date.today()
    return close_date if close_date >= today else close_date + timedelta(days=1)


def _period_name(value: date) -> str:
    return f"{GERMAN_MONTHS[value.month - 1]} {value.year}"


def close_cash_period_and_create_next(
    db: Session,
    *,
    cashbook: Cashbook,
    cash_period_id: int,
    closed_by: User,
    end_date: date | None = None,
) -> tuple[CashPeriod, CashPeriod, dict[str, object]]:
    cash_period = db.scalar(
        select(CashPeriod)
        .where(
            CashPeriod.id == cash_period_id,
            CashPeriod.cashbook_id == cashbook.id,
        )
        .with_for_update()
    )
    if cash_period is None:
        raise CashPeriodServiceError(
            "Kassenperiode nicht gefunden.", code="cash_period_not_found"
        )
    if cash_period.status == CashPeriodStatus.closed:
        raise CashPeriodServiceError(
            "Eine abgeschlossene Kassenperiode kann nicht erneut abgeschlossen werden.",
            code="cash_period_closed",
            conflict=True,
        )

    close_date = end_date or date.today()
    _validate_dates(cash_period.start_date, close_date)
    summary = get_cash_period_summary(db, cash_period)
    opening_amount = Decimal(str(summary["remaining_amount"]))
    now = utc_now()
    cash_period.end_date = close_date
    cash_period.status = CashPeriodStatus.closed
    cash_period.closed_at = now
    cash_period.closed_by_user_id = closed_by.id
    cash_period.updated_at = now
    db.flush()

    next_start = _next_period_start(close_date)
    next_period = CashPeriod(
        cashbook_id=cashbook.id,
        name=_period_name(next_start),
        opening_amount=opening_amount,
        currency=cash_period.currency,
        start_date=next_start,
        status=CashPeriodStatus.active,
        created_by_user_id=closed_by.id,
    )
    db.add(next_period)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CashPeriodServiceError(
            "Die Kassenperiode wurde parallel verändert. Bitte lade die Ansicht neu.",
            code="cash_period_close_conflict",
            conflict=True,
        ) from exc
    db.refresh(cash_period)
    db.refresh(next_period)
    return cash_period, next_period, summary

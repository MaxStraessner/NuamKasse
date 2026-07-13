from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.money import MoneyError, format_money, parse_money, validate_currency
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.category import Category
from app.models.expense import Expense
from app.models.user import User, UserRole, utc_now
from app.services.category_service import can_book_directly, get_category_by_id, get_category_filter_ids
from app.services.cash_summary_service import get_cash_period_summary, get_spent_amount


class ExpenseServiceError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "expense_error",
        status_code: int = 400,
        extra: dict[str, object] | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.extra = extra or {}


def _active_cash_period_for_update():
    return select(CashPeriod).where(CashPeriod.status == CashPeriodStatus.active).with_for_update()


def _get_active_cash_period_locked(db: Session) -> CashPeriod:
    cash_period = db.scalar(_active_cash_period_for_update())
    if cash_period is None:
        raise ExpenseServiceError(
            "Es ist keine aktive Kassenperiode vorhanden.",
            code="no_active_cash_period",
            status_code=404,
        )
    return cash_period


def _validate_void_reason(reason: str | None) -> str | None:
    if reason is None:
        return None
    clean_reason = reason.strip()
    if not clean_reason:
        raise ExpenseServiceError("Der Stornierungsgrund darf nicht leer sein.")
    if len(clean_reason) > 200:
        raise ExpenseServiceError("Der Stornierungsgrund darf höchstens 200 Zeichen lang sein.")
    return clean_reason


def _get_remaining_amount(db: Session, cash_period: CashPeriod) -> Decimal:
    return cash_period.opening_amount - get_spent_amount(db, cash_period.id)


def create_expense(
    db: Session,
    *,
    category_id: int,
    amount: str | Decimal,
    created_by: User,
) -> tuple[Expense, dict[str, object]]:
    cash_period = _get_active_cash_period_locked(db)
    if cash_period.status != CashPeriodStatus.active:
        raise ExpenseServiceError(
            "Die Kassenperiode ist bereits abgeschlossen.",
            code="cash_period_closed",
            status_code=409,
        )

    category = get_category_by_id(db, category_id, user_id=created_by.id)
    if category is None:
        raise ExpenseServiceError("Kategorie nicht gefunden.", code="category_not_found", status_code=404)
    if not category.is_active:
        raise ExpenseServiceError(
            "Diese Kategorie ist nicht mehr verfügbar.",
            code="category_inactive",
            status_code=409,
        )
    if not can_book_directly(db, category):
        raise ExpenseServiceError(
            "Bitte wähle zuerst eine Unterkategorie aus.",
            code="category_requires_subcategory",
            status_code=409,
        )

    try:
        expense_amount = parse_money(amount)
        currency = validate_currency(cash_period.currency)
    except MoneyError as exc:
        raise ExpenseServiceError(str(exc)) from exc

    remaining_amount = _get_remaining_amount(db, cash_period)
    if expense_amount > remaining_amount:
        raise ExpenseServiceError(
            "Der Betrag ist höher als der verbleibende Betrag.",
            code="insufficient_remaining_amount",
            status_code=409,
            extra={"remaining_amount": format_money(remaining_amount)},
        )

    expense = Expense(
        cash_period_id=cash_period.id,
        category_id=category.id,
        amount=expense_amount,
        currency=currency,
        created_by_user_id=created_by.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense, get_cash_period_summary(db, cash_period)


def list_current_expenses(
    db: Session,
    *,
    user: User,
    limit: int = 20,
    offset: int = 0,
    category_id: int | None = None,
    created_by_user_id: int | None = None,
    include_voided: bool = False,
) -> list[Expense]:
    cash_period = _get_active_cash_period_locked(db)
    query = select(Expense).where(Expense.cash_period_id == cash_period.id)
    if category_id is not None:
        category = get_category_by_id(db, category_id, user_id=user.id)
        if category is None:
            raise ExpenseServiceError("Kategorie nicht gefunden.", code="category_not_found", status_code=404)
        query = query.where(Expense.category_id.in_(get_category_filter_ids(db, category)))
    if created_by_user_id is not None:
        query = query.where(Expense.created_by_user_id == created_by_user_id)
    if user.role != UserRole.admin or not include_voided:
        query = query.where(Expense.is_voided.is_(False))
    query = query.order_by(Expense.created_at.desc(), Expense.id.desc()).offset(offset).limit(limit)
    return list(db.scalars(query))


def get_expense_by_id(db: Session, expense_id: int) -> Expense | None:
    return db.get(Expense, expense_id)


def void_expense(
    db: Session,
    *,
    expense: Expense,
    voided_by: User,
    reason: str | None = None,
) -> tuple[Expense, dict[str, object]]:
    cash_period = db.scalar(
        select(CashPeriod)
        .where(CashPeriod.id == expense.cash_period_id)
        .with_for_update()
    )
    if cash_period is None:
        raise ExpenseServiceError("Kassenperiode nicht gefunden.", code="cash_period_not_found", status_code=404)
    if cash_period.status != CashPeriodStatus.active:
        raise ExpenseServiceError(
            "Die Kassenperiode ist bereits abgeschlossen.",
            code="cash_period_closed",
            status_code=409,
        )
    if expense.is_voided:
        raise ExpenseServiceError(
            "Diese Buchung wurde bereits storniert.",
            code="expense_already_voided",
            status_code=409,
        )
    if voided_by.role != UserRole.admin and expense.created_by_user_id != voided_by.id:
        raise ExpenseServiceError(
            "Diese Buchung darf nicht storniert werden.",
            code="expense_void_forbidden",
            status_code=403,
        )

    now = utc_now()
    expense.is_voided = True
    expense.voided_at = now
    expense.voided_by_user_id = voided_by.id
    expense.void_reason = _validate_void_reason(reason)
    db.commit()
    db.refresh(expense)
    return expense, get_cash_period_summary(db, cash_period)

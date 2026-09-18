from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.money import MoneyError, format_money, parse_money, validate_currency
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.category import CategoryType
from app.models.expense import Expense
from app.models.user import User, utc_now
from app.services.category_service import (
    can_book_directly,
    get_category_by_id,
    get_category_filter_ids,
    get_effective_category_type,
)
from app.services.audit_service import record_admin_action
from app.services.cash_summary_service import get_cash_period_summary


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


def _active_cash_period_for_update(cashbook_id: int):
    return select(CashPeriod).where(
        CashPeriod.cashbook_id == cashbook_id,
        CashPeriod.status == CashPeriodStatus.active,
    ).with_for_update()


def _get_active_cash_period_locked(db: Session, cashbook_id: int) -> CashPeriod:
    cash_period = db.scalar(_active_cash_period_for_update(cashbook_id))
    if cash_period is None:
        raise ExpenseServiceError(
            "Es ist keine Kasse geöffnet.",
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


def _validate_note(note: str | None) -> str | None:
    if note is None:
        return None
    clean_note = note.strip()
    if not clean_note:
        return None
    if len(clean_note) > 500:
        raise ExpenseServiceError("Die Notiz darf höchstens 500 Zeichen lang sein.")
    return clean_note


def _get_remaining_amount(db: Session, cash_period: CashPeriod) -> Decimal:
    summary = get_cash_period_summary(db, cash_period)
    return Decimal(str(summary["remaining_amount"]))


def _validate_booking_date(
    cash_period: CashPeriod,
    booking_date: date,
    *,
    latest_booking_date: date,
) -> None:
    # Legacy periods may be marked active even though their configured start is
    # still in the future. In that state the start cannot be a valid lower
    # bound for today's booking, so retain the historic unrestricted lower
    # range instead of constructing an impossible interval.
    if cash_period.start_date <= latest_booking_date and booking_date < cash_period.start_date:
        raise ExpenseServiceError(
            "Das Buchungsdatum liegt vor dem Beginn dieser Kasse.",
            code="booking_date_before_period",
            status_code=409,
        )
    if cash_period.end_date is not None and booking_date > cash_period.end_date:
        raise ExpenseServiceError(
            "Das Buchungsdatum liegt nach dem Ende dieser Kasse.",
            code="booking_date_after_period",
            status_code=409,
        )
    if booking_date > latest_booking_date:
        raise ExpenseServiceError(
            "Das Buchungsdatum darf nicht in der Zukunft liegen.",
            code="booking_date_future",
            status_code=409,
        )


def _projected_remaining_amount(
    current_remaining: Decimal,
    *,
    current_type: CategoryType,
    current_amount: Decimal,
    next_type: CategoryType,
    next_amount: Decimal,
) -> Decimal:
    without_current = (
        current_remaining + current_amount
        if current_type == CategoryType.expense
        else current_remaining - current_amount
    )
    return (
        without_current - next_amount
        if next_type == CategoryType.expense
        else without_current + next_amount
    )


def create_expense(
    db: Session,
    *,
    category_id: int,
    amount: str | Decimal,
    created_by: User,
    cashbook_id: int,
    category_owner_user_id: int,
    note: str | None = None,
    booking_date: date | None = None,
    latest_booking_date: date,
) -> tuple[Expense, dict[str, object]]:
    cash_period = _get_active_cash_period_locked(db, cashbook_id)
    if cash_period.status != CashPeriodStatus.active:
        raise ExpenseServiceError(
            "Die Kasse ist bereits geschlossen.",
            code="cash_period_closed",
            status_code=409,
        )

    category = get_category_by_id(
        db,
        category_id,
        cashbook_id=cashbook_id,
        category_owner_user_id=category_owner_user_id,
    )
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

    transaction_type = get_effective_category_type(db, category)
    effective_booking_date = booking_date or latest_booking_date
    _validate_booking_date(
        cash_period,
        effective_booking_date,
        latest_booking_date=latest_booking_date,
    )
    remaining_amount = _get_remaining_amount(db, cash_period)
    if transaction_type == CategoryType.expense and expense_amount > remaining_amount:
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
        transaction_type=transaction_type,
        currency=currency,
        created_by_user_id=created_by.id,
        note=_validate_note(note),
        booking_date=effective_booking_date,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense, get_cash_period_summary(db, cash_period)


def list_current_expenses(
    db: Session,
    *,
    user: User,
    cashbook_id: int,
    category_owner_user_id: int,
    is_admin: bool,
    limit: int = 20,
    offset: int = 0,
    category_id: int | None = None,
    created_by_user_id: int | None = None,
    include_voided: bool = False,
) -> list[Expense]:
    cash_period = _get_active_cash_period_locked(db, cashbook_id)
    query = select(Expense).where(Expense.cash_period_id == cash_period.id)
    if category_id is not None:
        category = get_category_by_id(
            db,
            category_id,
            cashbook_id=cashbook_id,
            category_owner_user_id=category_owner_user_id,
        )
        if category is None:
            raise ExpenseServiceError("Kategorie nicht gefunden.", code="category_not_found", status_code=404)
        query = query.where(Expense.category_id.in_(get_category_filter_ids(db, category)))
    if created_by_user_id is not None:
        query = query.where(Expense.created_by_user_id == created_by_user_id)
    if not is_admin or not include_voided:
        query = query.where(Expense.is_voided.is_(False))
    query = query.order_by(
        Expense.booking_date.desc(),
        Expense.created_at.desc(),
        Expense.id.desc(),
    ).offset(offset).limit(limit)
    return list(db.scalars(query))


def get_expense_by_id(db: Session, expense_id: int, *, cashbook_id: int) -> Expense | None:
    return db.scalar(
        select(Expense)
        .join(CashPeriod, CashPeriod.id == Expense.cash_period_id)
        .where(Expense.id == expense_id, CashPeriod.cashbook_id == cashbook_id)
    )


def void_expense(
    db: Session,
    *,
    expense: Expense,
    voided_by: User,
    cashbook_id: int,
    is_admin: bool,
    reason: str | None = None,
) -> tuple[Expense, dict[str, object]]:
    cash_period = db.scalar(
        select(CashPeriod)
        .where(
            CashPeriod.id == expense.cash_period_id,
            CashPeriod.cashbook_id == cashbook_id,
        )
        .with_for_update()
    )
    if cash_period is None:
        raise ExpenseServiceError("Kassenstand nicht gefunden.", code="cash_period_not_found", status_code=404)
    if cash_period.status != CashPeriodStatus.active:
        raise ExpenseServiceError(
            "Die Kasse ist bereits geschlossen.",
            code="cash_period_closed",
            status_code=409,
        )
    if expense.is_voided:
        raise ExpenseServiceError(
            "Diese Buchung wurde bereits storniert.",
            code="expense_already_voided",
            status_code=409,
        )
    if not is_admin and expense.created_by_user_id != voided_by.id:
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


def update_expense(
    db: Session,
    *,
    expense: Expense,
    updated_by: User,
    cashbook_id: int,
    category_owner_user_id: int,
    is_admin: bool,
    latest_booking_date: date,
    category_id: int | None = None,
    amount: str | Decimal | None = None,
    note: str | None = None,
    booking_date: date | None = None,
) -> tuple[Expense, dict[str, object]]:
    cash_period = db.scalar(
        select(CashPeriod)
        .where(
            CashPeriod.id == expense.cash_period_id,
            CashPeriod.cashbook_id == cashbook_id,
        )
        .with_for_update()
    )
    if cash_period is None:
        raise ExpenseServiceError("Kassenstand nicht gefunden.", code="cash_period_not_found", status_code=404)
    if cash_period.status != CashPeriodStatus.active:
        raise ExpenseServiceError(
            "Die Kasse ist bereits geschlossen.",
            code="cash_period_closed",
            status_code=409,
        )
    if expense.is_voided:
        raise ExpenseServiceError(
            "Eine stornierte Buchung kann nicht bearbeitet werden.",
            code="expense_voided",
            status_code=409,
        )
    if not is_admin and expense.created_by_user_id != updated_by.id:
        raise ExpenseServiceError(
            "Diese Buchung darf nicht bearbeitet werden.",
            code="expense_update_forbidden",
            status_code=403,
        )

    category = expense.category
    next_transaction_type = expense.transaction_type
    if category_id is not None and category_id != expense.category_id:
        category = get_category_by_id(
            db,
            category_id,
            cashbook_id=cashbook_id,
            category_owner_user_id=category_owner_user_id,
        )
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
        next_transaction_type = get_effective_category_type(db, category)

    try:
        next_amount = parse_money(amount) if amount is not None else expense.amount
    except MoneyError as exc:
        raise ExpenseServiceError(str(exc)) from exc
    next_booking_date = booking_date or expense.booking_date
    _validate_booking_date(
        cash_period,
        next_booking_date,
        latest_booking_date=latest_booking_date,
    )

    projected_remaining = _projected_remaining_amount(
        _get_remaining_amount(db, cash_period),
        current_type=expense.transaction_type,
        current_amount=expense.amount,
        next_type=next_transaction_type,
        next_amount=next_amount,
    )
    if projected_remaining < Decimal("0.00"):
        raise ExpenseServiceError(
            "Durch diese Änderung wäre der verbleibende Betrag negativ.",
            code="insufficient_remaining_amount",
            status_code=409,
            extra={"remaining_amount": format_money(_get_remaining_amount(db, cash_period))},
        )

    changed_fields: list[str] = []
    if expense.category_id != category.id:
        expense.category_id = category.id
        expense.transaction_type = next_transaction_type
        changed_fields.extend(["category_id", "transaction_type"])
    if expense.amount != next_amount:
        expense.amount = next_amount
        changed_fields.append("amount")
    next_note = _validate_note(note)
    if expense.note != next_note:
        expense.note = next_note
        changed_fields.append("note")
    if expense.booking_date != next_booking_date:
        expense.booking_date = next_booking_date
        changed_fields.append("booking_date")

    if changed_fields:
        record_admin_action(
            db,
            actor=updated_by,
            target=expense.created_by,
            action="expense.updated",
            details={
                "expense_id": expense.id,
                "cash_period_id": expense.cash_period_id,
                "changed_fields": changed_fields,
            },
        )
    db.commit()
    db.refresh(expense)
    return expense, get_cash_period_summary(db, cash_period)

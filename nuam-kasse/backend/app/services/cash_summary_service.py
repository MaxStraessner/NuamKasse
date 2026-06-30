from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.money import format_money
from app.models.cash_period import CashPeriod
from app.models.expense import Expense


def get_spent_amount(db: Session, cash_period_id: int) -> Decimal:
    amount = db.scalar(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(
            Expense.cash_period_id == cash_period_id,
            Expense.is_voided.is_(False),
        )
    )
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount or "0.00"))


def get_expense_counts(db: Session, cash_period_id: int) -> dict[str, int]:
    rows = db.execute(
        select(Expense.is_voided, func.count(Expense.id)).where(
            Expense.cash_period_id == cash_period_id,
        ).group_by(Expense.is_voided)
    ).all()
    counts = {bool(is_voided): int(count) for is_voided, count in rows}
    active_count = counts.get(False, 0)
    voided_count = counts.get(True, 0)
    return {
        "expense_count": active_count + voided_count,
        "active_expense_count": active_count,
        "voided_expense_count": voided_count,
    }


def get_cash_period_summary(db: Session, cash_period: CashPeriod) -> dict[str, object]:
    opening_amount = cash_period.opening_amount
    spent_amount = get_spent_amount(db, cash_period.id)
    remaining_amount = opening_amount - spent_amount
    if remaining_amount < Decimal("0.00"):
        remaining_amount = Decimal("0.00")
    counts = get_expense_counts(db, cash_period.id)
    return {
        "cash_period_id": cash_period.id,
        "name": cash_period.name,
        "opening_amount": format_money(opening_amount),
        "spent_amount": format_money(spent_amount),
        "remaining_amount": format_money(remaining_amount),
        "currency": cash_period.currency,
        "status": cash_period.status,
        **counts,
    }

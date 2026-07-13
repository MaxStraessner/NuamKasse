from datetime import date, datetime, time, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, aliased

from app.core.money import format_money
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.category import Category
from app.models.category import CategoryType
from app.models.expense import Expense
from app.models.user import User, UserRole
from app.services.cash_period_service import get_active_cash_period, get_cash_period_by_id
from app.services.cash_summary_service import get_cash_period_summary
from app.services.category_service import get_category_filter_ids

PERCENT_QUANT = Decimal("0.01")
VALID_EXPENSE_SORTS = {"created_at_desc", "created_at_asc", "amount_desc", "amount_asc"}


class OverviewServiceError(ValueError):
    def __init__(self, message: str, *, code: str = "overview_error", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def _format_percent(value: Decimal) -> str:
    return str(value.quantize(PERCENT_QUANT, rounding=ROUND_HALF_UP))


def _percentage(amount: Decimal, total: Decimal) -> str:
    if total <= Decimal("0.00"):
        return "0.00"
    return _format_percent((amount / total) * Decimal("100"))


def _date_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _date_end(value: date) -> datetime:
    return datetime.combine(value, time.max, tzinfo=timezone.utc)


def _overview_summary(db: Session, cash_period: CashPeriod) -> dict[str, object]:
    summary = get_cash_period_summary(db, cash_period)
    return {
        "cash_period": cash_period,
        "opening_amount": summary["opening_amount"],
        "spent_amount": summary["spent_amount"],
        "income_amount": summary["income_amount"],
        "remaining_amount": summary["remaining_amount"],
        "expense_count": summary["expense_count"],
        "active_expense_count": summary["active_expense_count"],
        "voided_expense_count": summary["voided_expense_count"],
    }


def _total_spending(db: Session, cash_period_id: int) -> Decimal:
    amount = db.scalar(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(
            Expense.cash_period_id == cash_period_id,
            Expense.is_voided.is_(False),
            Expense.transaction_type == CategoryType.expense,
        )
    )
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount or "0.00"))


def _total_income(db: Session, cash_period_id: int) -> Decimal:
    amount = db.scalar(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(
            Expense.cash_period_id == cash_period_id,
            Expense.is_voided.is_(False),
            Expense.transaction_type == CategoryType.income,
        )
    )
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount or "0.00"))


def get_category_summaries(db: Session, cash_period_id: int) -> list[dict[str, object]]:
    total_spending = _total_spending(db, cash_period_id)
    total_income = _total_income(db, cash_period_id)
    total_amount = func.coalesce(func.sum(Expense.amount), Decimal("0.00"))
    parent_category = aliased(Category)
    root_id = func.coalesce(parent_category.id, Category.id)
    root_name = func.coalesce(parent_category.name, Category.name)
    root_icon = func.coalesce(parent_category.icon_key, Category.icon_key)
    root_color = func.coalesce(parent_category.color_key, Category.color_key)
    root_image_preview_path = func.coalesce(parent_category.image_preview_path, Category.image_preview_path)
    root_image_updated_at = func.coalesce(parent_category.image_updated_at, Category.image_updated_at)
    rows = db.execute(
        select(
            root_id,
            root_name,
            root_icon,
            root_color,
            Expense.transaction_type,
            root_image_preview_path,
            root_image_updated_at,
            func.count(Expense.id),
            total_amount,
        )
        .select_from(Category)
        .join(Expense, Expense.category_id == Category.id)
        .outerjoin(parent_category, Category.parent_category_id == parent_category.id)
        .where(
            Expense.cash_period_id == cash_period_id,
            Expense.is_voided.is_(False),
        )
        .group_by(root_id, root_name, root_icon, root_color, Expense.transaction_type, root_image_preview_path, root_image_updated_at)
        .order_by(total_amount.desc(), root_name.asc())
    ).all()
    return [
        {
            "category_id": category_id,
            "category_name": name,
            "icon_key": icon_key,
            "color_key": color_key,
            "category_type": transaction_type,
            "image_preview_path": image_preview_path,
            "image_updated_at": image_updated_at,
            "expense_count": int(expense_count),
            "total_amount": format_money(amount),
            "percentage_of_spending": _percentage(
                amount,
                total_income if transaction_type == CategoryType.income else total_spending,
            ),
        }
        for category_id, name, icon_key, color_key, transaction_type, image_preview_path, image_updated_at, expense_count, amount in rows
    ]


def get_user_summaries(db: Session, cash_period_id: int) -> list[dict[str, object]]:
    total_activity = _total_spending(db, cash_period_id) + _total_income(db, cash_period_id)
    total_amount = func.coalesce(func.sum(Expense.amount), Decimal("0.00"))
    rows = db.execute(
        select(
            User.id,
            User.display_name,
            func.count(Expense.id),
            total_amount,
        )
        .join(Expense, Expense.created_by_user_id == User.id)
        .where(
            Expense.cash_period_id == cash_period_id,
            Expense.is_voided.is_(False),
        )
        .group_by(User.id, User.display_name)
        .order_by(total_amount.desc(), User.display_name.asc())
    ).all()
    return [
        {
            "user_id": user_id,
            "display_name": display_name,
            "expense_count": int(expense_count),
            "total_amount": format_money(amount),
            "percentage_of_spending": _percentage(amount, total_activity),
        }
        for user_id, display_name, expense_count, amount in rows
    ]


def get_current_overview(db: Session, user: User) -> dict[str, object]:
    cash_period = get_active_cash_period(db)
    if cash_period is None:
        raise OverviewServiceError(
            "Es ist keine aktive Kassenperiode vorhanden.",
            code="no_active_cash_period",
            status_code=404,
        )
    return get_cash_period_overview(db, cash_period, user=user)


def get_cash_period_overview(db: Session, cash_period: CashPeriod, *, user: User) -> dict[str, object]:
    recent = list_cash_period_expenses(
        db,
        cash_period=cash_period,
        user=user,
        include_voided=user.role == UserRole.admin,
        limit=5,
        offset=0,
    )
    return {
        "summary": _overview_summary(db, cash_period),
        "categories": get_category_summaries(db, cash_period.id),
        "users": get_user_summaries(db, cash_period.id),
        "recent_expenses": recent["items"],
    }


def get_overview_cash_period_by_id(db: Session, cash_period_id: int) -> CashPeriod:
    cash_period = get_cash_period_by_id(db, cash_period_id)
    if cash_period is None:
        raise OverviewServiceError(
            "Kassenperiode nicht gefunden.",
            code="cash_period_not_found",
            status_code=404,
        )
    return cash_period


def _validate_filter_entities(
    db: Session,
    *,
    user: User,
    category_id: int | None,
    created_by_user_id: int | None,
) -> None:
    if category_id is not None:
        category = db.get(Category, category_id)
        if category is None or category.user_id != user.id:
            raise OverviewServiceError("Kategorie nicht gefunden.", code="category_not_found", status_code=404)
    if created_by_user_id is not None and db.get(User, created_by_user_id) is None:
        raise OverviewServiceError("Benutzer nicht gefunden.", code="user_not_found", status_code=404)


def _apply_expense_filters(
    query: Select[tuple[Expense]],
    *,
    cash_period_id: int,
    user: User,
    category_ids: list[int] | None,
    created_by_user_id: int | None,
    date_from: date | None,
    date_to: date | None,
    include_voided: bool,
) -> Select[tuple[Expense]]:
    query = query.where(Expense.cash_period_id == cash_period_id)
    if category_ids:
        query = query.where(Expense.category_id.in_(category_ids))
    if created_by_user_id is not None:
        query = query.where(Expense.created_by_user_id == created_by_user_id)
    if date_from is not None:
        query = query.where(Expense.created_at >= _date_start(date_from))
    if date_to is not None:
        query = query.where(Expense.created_at <= _date_end(date_to))
    if user.role != UserRole.admin or not include_voided:
        query = query.where(Expense.is_voided.is_(False))
    return query


def _apply_sort(query: Select[tuple[Expense]], sort: str) -> Select[tuple[Expense]]:
    if sort == "created_at_desc":
        return query.order_by(Expense.created_at.desc(), Expense.id.desc())
    if sort == "created_at_asc":
        return query.order_by(Expense.created_at.asc(), Expense.id.asc())
    if sort == "amount_desc":
        return query.order_by(Expense.amount.desc(), Expense.id.desc())
    if sort == "amount_asc":
        return query.order_by(Expense.amount.asc(), Expense.id.asc())
    raise OverviewServiceError("Ungültige Sortierung.", code="invalid_sort")


def list_cash_period_expenses(
    db: Session,
    *,
    cash_period: CashPeriod,
    user: User,
    category_id: int | None = None,
    created_by_user_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    include_voided: bool = False,
    limit: int = 20,
    offset: int = 0,
    sort: str = "created_at_desc",
) -> dict[str, object]:
    if cash_period.status != CashPeriodStatus.active and user.role != UserRole.admin:
        raise OverviewServiceError(
            "Diese Kassenperiode ist nur für Administratoren verfügbar.",
            code="cash_period_forbidden",
            status_code=403,
        )
    if date_from is not None and date_to is not None and date_to < date_from:
        raise OverviewServiceError("Das Ende darf nicht vor dem Beginn liegen.", code="invalid_date_range")
    if sort not in VALID_EXPENSE_SORTS:
        raise OverviewServiceError("Ungültige Sortierung.", code="invalid_sort")

    _validate_filter_entities(db, user=user, category_id=category_id, created_by_user_id=created_by_user_id)
    category_ids = None
    if category_id is not None:
        category = db.get(Category, category_id)
        if category is not None and category.user_id == user.id:
            category_ids = get_category_filter_ids(db, category)
    effective_include_voided = include_voided and user.role == UserRole.admin
    filtered = _apply_expense_filters(
        select(Expense),
        cash_period_id=cash_period.id,
        user=user,
        category_ids=category_ids,
        created_by_user_id=created_by_user_id,
        date_from=date_from,
        date_to=date_to,
        include_voided=effective_include_voided,
    )
    total = int(db.scalar(select(func.count()).select_from(filtered.subquery())) or 0)
    items = list(db.scalars(_apply_sort(filtered, sort).offset(offset).limit(limit)))
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(items) < total,
    }

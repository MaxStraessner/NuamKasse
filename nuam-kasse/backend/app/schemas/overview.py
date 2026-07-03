from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_serializer

from app.core.money import format_money
from app.models.cash_period import CashPeriodStatus


class OverviewCashPeriodRead(BaseModel):
    id: int
    name: str
    status: CashPeriodStatus
    start_date: date
    end_date: date | None
    currency: str

    model_config = ConfigDict(from_attributes=True)


class OverviewSummary(BaseModel):
    cash_period: OverviewCashPeriodRead
    opening_amount: str
    spent_amount: str
    remaining_amount: str
    expense_count: int
    active_expense_count: int
    voided_expense_count: int


class OverviewCategorySummary(BaseModel):
    category_id: int
    category_name: str
    icon_key: str
    color_key: str
    expense_count: int
    total_amount: str
    percentage_of_spending: str


class OverviewUserSummary(BaseModel):
    user_id: int
    display_name: str
    expense_count: int
    total_amount: str
    percentage_of_spending: str


class OverviewExpenseCategory(BaseModel):
    id: int
    name: str
    icon_key: str
    color_key: str
    parent_category_id: int | None

    model_config = ConfigDict(from_attributes=True)


class OverviewExpenseUser(BaseModel):
    id: int
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class OverviewExpenseRead(BaseModel):
    id: int
    cash_period_id: int
    category: OverviewExpenseCategory
    amount: Decimal
    currency: str
    created_by: OverviewExpenseUser
    created_at: datetime
    is_voided: bool
    voided_at: datetime | None = None
    voided_by: OverviewExpenseUser | None = None
    void_reason: str | None = None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return format_money(value)

    model_config = ConfigDict(from_attributes=True)


class CashPeriodOverview(BaseModel):
    summary: OverviewSummary
    categories: list[OverviewCategorySummary]
    users: list[OverviewUserSummary]
    recent_expenses: list[OverviewExpenseRead]


class PaginatedOverviewExpenses(BaseModel):
    items: list[OverviewExpenseRead]
    total: int
    limit: int
    offset: int
    has_more: bool

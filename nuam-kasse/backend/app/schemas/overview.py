from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_serializer

from app.core.money import format_money
from app.models.cash_period import CashPeriodStatus
from app.models.category import CategoryType


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
    income_amount: str
    remaining_amount: str
    expense_count: int
    active_expense_count: int
    voided_expense_count: int


class OverviewCategorySummary(BaseModel):
    category_id: int
    category_name: str
    icon_key: str
    color_key: str
    category_type: CategoryType
    image_updated_at: datetime | None = None
    image_preview_path: str | None = Field(default=None, exclude=True)
    expense_count: int
    total_amount: str
    percentage_of_spending: str

    @computed_field
    @property
    def has_custom_image(self) -> bool:
        return bool(self.image_preview_path and self.image_updated_at)

    @computed_field
    @property
    def image_url(self) -> str | None:
        if not self.has_custom_image:
            return None
        version = self.image_updated_at.isoformat()
        return f"/api/v1/categories/{self.category_id}/image?v={version}"


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
    category_type: CategoryType
    image_updated_at: datetime | None = None
    image_preview_path: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_custom_image(self) -> bool:
        return bool(self.image_preview_path and self.image_updated_at)

    @computed_field
    @property
    def image_url(self) -> str | None:
        if not self.has_custom_image:
            return None
        version = self.image_updated_at.isoformat()
        return f"/api/v1/categories/{self.id}/image?v={version}"

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
    transaction_type: CategoryType
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

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.core.money import format_money
from app.schemas.cash_period import CashPeriodSummary


class ExpenseCategoryRead(BaseModel):
    id: int
    name: str
    icon_key: str
    color_key: str
    parent_category_id: int | None

    model_config = ConfigDict(from_attributes=True)


class ExpenseUserRead(BaseModel):
    id: int
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class ExpenseCreate(BaseModel):
    category_id: int
    amount: str = Field(min_length=1, max_length=20)

    model_config = ConfigDict(extra="forbid")


class ExpenseVoidRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=200)

    model_config = ConfigDict(extra="forbid")


class ExpenseRead(BaseModel):
    id: int
    cash_period_id: int
    category: ExpenseCategoryRead
    amount: Decimal
    currency: str
    created_by: ExpenseUserRead
    created_at: datetime
    is_voided: bool
    voided_at: datetime | None
    voided_by: ExpenseUserRead | None
    void_reason: str | None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return format_money(value)

    model_config = ConfigDict(from_attributes=True)


class ExpenseMutationResponse(BaseModel):
    expense: ExpenseRead
    summary: CashPeriodSummary

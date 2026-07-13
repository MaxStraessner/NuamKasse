from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.core.money import format_money
from app.models.cash_period import CashPeriodStatus


class CashPeriodUserRead(BaseModel):
    id: int
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class CashPeriodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    opening_amount: str = Field(min_length=1, max_length=20)
    currency: str = Field(default="THB", min_length=3, max_length=3)
    start_date: date
    end_date: date | None = None

    model_config = ConfigDict(extra="forbid")


class CashPeriodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    opening_amount: str | None = Field(default=None, min_length=1, max_length=20)
    start_date: date | None = None
    end_date: date | None = None

    model_config = ConfigDict(extra="forbid")


class CashPeriodCloseRequest(BaseModel):
    end_date: date | None = None

    model_config = ConfigDict(extra="forbid")


class CashPeriodRead(BaseModel):
    id: int
    name: str
    opening_amount: Decimal
    currency: str
    start_date: date
    end_date: date | None
    status: CashPeriodStatus
    created_by: CashPeriodUserRead
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    closed_by: CashPeriodUserRead | None

    @field_serializer("opening_amount")
    def serialize_opening_amount(self, value: Decimal) -> str:
        return format_money(value)

    model_config = ConfigDict(from_attributes=True)


class CashPeriodSummary(BaseModel):
    cash_period_id: int
    name: str
    opening_amount: str
    spent_amount: str
    income_amount: str
    remaining_amount: str
    currency: str
    status: CashPeriodStatus
    expense_count: int
    active_expense_count: int
    voided_expense_count: int

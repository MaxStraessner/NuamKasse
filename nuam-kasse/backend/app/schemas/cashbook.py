from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.cashbook import CashbookRole


class CashbookRead(BaseModel):
    id: int
    name: str
    currency: str
    description: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CashbookMembershipUserRead(BaseModel):
    id: int
    username: str
    display_name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class CashbookMembershipRead(BaseModel):
    id: int
    role: CashbookRole
    created_at: datetime
    user: CashbookMembershipUserRead

    model_config = ConfigDict(from_attributes=True)


class CashbookMemberCandidateRead(BaseModel):
    id: int
    username: str
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class CashbookMemberCreate(BaseModel):
    user_id: int = Field(gt=0)

    model_config = ConfigDict(extra="forbid")


class CashbookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    opening_amount: str = Field(min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=1000)
    template_cashbook_id: int | None = Field(default=None, gt=0)
    member_user_ids: list[int] = Field(default_factory=list)
    start_date: date | None = None

    model_config = ConfigDict(extra="forbid")


class CashbookListItem(CashbookRead):
    role: CashbookRole
    current_balance: str
    active_period_id: int | None

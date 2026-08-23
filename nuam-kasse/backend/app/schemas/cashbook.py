from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.cashbook import CashbookRole


class CashbookRead(BaseModel):
    id: int
    name: str
    currency: str

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

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.cashbook import CashbookRole, PeriodAccessMode
from app.models.user import UserRole


class UserRead(BaseModel):
    id: int
    username: str
    display_name: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    created_at: datetime | None = None
    last_login_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UserCashbookAccessInput(BaseModel):
    cashbook_id: int = Field(gt=0)
    cashbook_role: CashbookRole | None = None
    period_access_mode: PeriodAccessMode = PeriodAccessMode.all
    period_ids: list[int] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=128)
    password_confirmation: str = Field(min_length=1, max_length=128)
    role: UserRole = UserRole.member
    is_active: bool = True
    cashbook_accesses: list[UserCashbookAccessInput] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=80)
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None

    model_config = ConfigDict(extra="forbid")


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=1, max_length=128)
    new_password_confirmation: str = Field(min_length=1, max_length=128)


class MessageResponse(BaseModel):
    message: str


class UserCashbookAccessRead(BaseModel):
    cashbook_id: int
    cashbook_name: str
    cashbook_role: CashbookRole
    period_access_mode: PeriodAccessMode
    period_access_from: date | None
    accessible_period_ids: list[int]
    accessible_period_count: int
    available_period_count: int


class AdminUserRead(UserRead):
    cashbook_accesses: list[UserCashbookAccessRead]
    cashbook_count: int
    accessible_period_count: int


class CashPeriodAccessOptionRead(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date | None
    status: str


class CashbookAccessOptionRead(BaseModel):
    id: int
    name: str
    periods: list[CashPeriodAccessOptionRead]


class UserCashbookAccessUpdate(BaseModel):
    cashbook_accesses: list[UserCashbookAccessInput]

    model_config = ConfigDict(extra="forbid")


class AdminAuditLogRead(BaseModel):
    id: int
    actor_user_id: int | None
    actor_username: str | None
    target_user_id: int | None
    target_username: str | None
    action: str
    details: dict[str, object] | None
    created_at: datetime

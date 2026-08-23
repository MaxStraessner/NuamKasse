from pydantic import BaseModel, Field

from app.schemas.user import UserRead
from app.models.cashbook import CashbookRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)
    new_password_confirmation: str = Field(min_length=1, max_length=128)


class AuthUserResponse(UserRead):
    cashbook_id: int | None = None
    cashbook_name: str | None = None
    cashbook_role: CashbookRole | None = None

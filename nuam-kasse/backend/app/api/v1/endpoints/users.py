from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    MessageResponse,
    PasswordResetRequest,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.services.user_service import (
    UserServiceError,
    create_user,
    get_user_by_id,
    list_users,
    reset_user_password,
    update_user,
)

router = APIRouter(prefix="/users", tags=["users"])


def _get_target_user(db: Session, user_id: int) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benutzer nicht gefunden.")
    return user


@router.get("", response_model=list[UserRead])
def read_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[User]:
    return list_users(db)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user_endpoint(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    try:
        return create_user(
            db,
            username=payload.username,
            display_name=payload.display_name,
            password=payload.password,
            password_confirmation=payload.password_confirmation,
            role=payload.role,
            must_change_password=True,
        )
    except UserServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{user_id}", response_model=UserRead)
def update_user_endpoint(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = _get_target_user(db, user_id)
    try:
        return update_user(
            db,
            user,
            username=payload.username,
            display_name=payload.display_name,
            role=payload.role,
            is_active=payload.is_active,
        )
    except UserServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
def reset_user_password_endpoint(
    user_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> MessageResponse:
    user = _get_target_user(db, user_id)
    try:
        reset_user_password(
            db,
            user,
            new_password=payload.new_password,
            new_password_confirmation=payload.new_password_confirmation,
        )
    except UserServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MessageResponse(message="Passwort wurde zurueckgesetzt.")

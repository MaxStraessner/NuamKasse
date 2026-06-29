from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    get_current_session_and_user,
    require_authenticated_user,
)
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.auth import AuthUserResponse, ChangePasswordRequest, LoginRequest
from app.schemas.user import MessageResponse
from app.services.auth_service import (
    AuthServiceError,
    authenticate_user,
    change_own_password,
    create_session,
    delete_session,
    get_session_by_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 60 * 60,
        httponly=True,
        secure=settings.session_cookie_secure or settings.is_production,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def _clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        samesite=settings.session_cookie_samesite,
        secure=settings.session_cookie_secure or settings.is_production,
        httponly=True,
    )


@router.post("/login", response_model=AuthUserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    try:
        user = authenticate_user(db, payload.username, payload.password)
    except AuthServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    token, _ = create_session(db, user, settings)
    _set_session_cookie(response, token, settings)
    return user


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        delete_session(db, get_session_by_token(db, token))
    _clear_session_cookie(response, settings)
    return MessageResponse(message="Abgemeldet.")


@router.get("/me", response_model=AuthUserResponse)
def read_current_user(
    user: User = Depends(require_authenticated_user),
) -> User:
    return user


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    session_and_user: tuple[UserSession, User] = Depends(get_current_session_and_user),
) -> MessageResponse:
    current_session, user = session_and_user
    try:
        change_own_password(
            db,
            user,
            current_session=current_session,
            current_password=payload.current_password,
            new_password=payload.new_password,
            new_password_confirmation=payload.new_password_confirmation,
        )
    except AuthServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MessageResponse(message="Passwort wurde geaendert.")

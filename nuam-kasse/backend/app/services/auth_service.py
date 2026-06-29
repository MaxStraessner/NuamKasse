from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    create_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.models.user import User, utc_now
from app.models.user_session import UserSession
from app.services.user_service import (
    UserServiceError,
    delete_user_sessions,
    ensure_password_confirmation,
    get_user_by_normalized_username,
)

INVALID_LOGIN_MESSAGE = "Benutzername oder Passwort ist nicht korrekt."


class AuthServiceError(ValueError):
    pass


def authenticate_user(db: Session, username: str, password: str) -> User:
    user = get_user_by_normalized_username(db, username)
    if user is None or not verify_password(password, user.password_hash):
        raise AuthServiceError(INVALID_LOGIN_MESSAGE)
    if not user.is_active:
        raise AuthServiceError("Dieses Benutzerkonto ist deaktiviert.")
    return user


def create_session(db: Session, user: User, settings: Settings) -> tuple[str, UserSession]:
    token = create_session_token()
    now = utc_now()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(token),
        created_at=now,
        expires_at=now + timedelta(hours=settings.session_ttl_hours),
        last_used_at=now,
    )
    user.last_login_at = now
    db.add(session)
    db.commit()
    db.refresh(user)
    db.refresh(session)
    return token, session


def get_session_by_token(db: Session, token: str) -> UserSession | None:
    return db.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(token))
    )


def delete_session(db: Session, session: UserSession | None) -> None:
    if session is not None:
        db.delete(session)
        db.commit()


def change_own_password(
    db: Session,
    user: User,
    *,
    current_session: UserSession,
    current_password: str,
    new_password: str,
    new_password_confirmation: str,
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AuthServiceError("Das bisherige Passwort ist nicht korrekt.")
    try:
        ensure_password_confirmation(new_password, new_password_confirmation)
    except UserServiceError as exc:
        raise AuthServiceError(str(exc)) from exc

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    delete_user_sessions(db, user.id, keep_session_id=current_session.id)
    db.commit()

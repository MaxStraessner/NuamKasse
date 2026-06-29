from datetime import timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.user import User, UserRole, utc_now
from app.models.user_session import UserSession
from app.services.auth_service import get_session_by_token


def get_current_session_and_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> tuple[UserSession, User]:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Eine Anmeldung ist erforderlich.",
        )

    session = get_session_by_token(db, token)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Die Sitzung ist ungueltig oder abgelaufen.",
        )

    now = utc_now()
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Die Sitzung ist ungueltig oder abgelaufen.",
        )

    user = session.user
    if user is None or not user.is_active:
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Die Sitzung ist ungueltig oder abgelaufen.",
        )

    session.last_used_at = now
    db.commit()
    db.refresh(session)
    db.refresh(user)
    return session, user


def require_authenticated_user(
    session_and_user: tuple[UserSession, User] = Depends(get_current_session_and_user),
) -> User:
    return session_and_user[1]


def require_current_session(
    session_and_user: tuple[UserSession, User] = Depends(get_current_session_and_user),
) -> UserSession:
    return session_and_user[0]


def require_admin(
    user: User = Depends(require_authenticated_user),
) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diese Funktion ist nur fuer Administratoren verfuegbar.",
        )
    return user


def require_password_change_completed(
    user: User = Depends(require_authenticated_user),
) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="password_change_required",
        )
    return user

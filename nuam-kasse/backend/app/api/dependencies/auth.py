from datetime import timezone

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.user import User, UserRole, utc_now
from app.models.user_session import UserSession
from app.models.cash_period import CashPeriod
from app.services.access_control_service import membership_can_access_cash_period
from app.services.auth_service import get_session_by_token
from app.services.cashbook_service import CashbookAccess, get_cashbook_access


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
            detail="Die Sitzung ist ungültig oder abgelaufen.",
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
            detail="Die Sitzung ist ungültig oder abgelaufen.",
        )

    user = session.user
    if user is None or not user.is_active:
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Die Sitzung ist ungültig oder abgelaufen.",
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
            detail="Diese Funktion ist nur für Administratoren verfügbar.",
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


def require_cashbook_member(
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
    cashbook_id: int | None = Header(default=None, alias="X-Cashbook-ID"),
) -> CashbookAccess:
    access = get_cashbook_access(db, user, cashbook_id)
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "cashbook_membership_required",
                "message": "Dieser Benutzer ist keiner Kasse zugeordnet.",
            },
        )
    return access


def require_cashbook_admin(
    access: CashbookAccess = Depends(require_cashbook_member),
) -> CashbookAccess:
    if not access.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "cashbook_admin_required",
                "message": "Diese Funktion ist nur für den Administrator der Kasse verfügbar.",
            },
        )
    return access


def ensure_cash_period_access(
    db: Session,
    access: CashbookAccess,
    cash_period: CashPeriod,
) -> None:
    if not membership_can_access_cash_period(db, access.membership, cash_period):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "cash_period_access_required",
                "message": "Für diese Kassenperiode besteht keine Berechtigung.",
            },
        )

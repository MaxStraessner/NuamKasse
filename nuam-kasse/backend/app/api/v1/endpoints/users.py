from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    AdminAuditLogRead,
    AdminUserRead,
    CashbookAccessOptionRead,
    MessageResponse,
    PasswordResetRequest,
    UserCreate,
    UserCashbookAccessUpdate,
    UserUpdate,
)
from app.services.user_service import (
    UserServiceError,
    create_user,
    get_user_by_id,
    admin_user_read,
    list_admin_users,
    list_cashbook_access_options,
    reset_user_password,
    set_user_cashbook_accesses,
    update_user,
)
from app.services.audit_service import list_admin_audit_logs

router = APIRouter(prefix="/users", tags=["users"])


def _get_target_user(db: Session, user_id: int) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benutzer nicht gefunden.")
    return user


@router.get("", response_model=list[AdminUserRead])
def read_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[dict[str, object]]:
    return list_admin_users(db)


@router.get("/access-options", response_model=list[CashbookAccessOptionRead])
def read_access_options(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[dict[str, object]]:
    return list_cashbook_access_options(db)


@router.get("/audit-log", response_model=list[AdminAuditLogRead])
def read_audit_log(
    target_user_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[dict[str, object]]:
    return list_admin_audit_logs(db, target_user_id=target_user_id, limit=limit)


@router.post("", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_user_endpoint(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, object]:
    try:
        user = create_user(
            db,
            username=payload.username,
            display_name=payload.display_name,
            password=payload.password,
            password_confirmation=payload.password_confirmation,
            role=payload.role,
            is_active=payload.is_active,
            must_change_password=True,
            cashbook_accesses=[
                access.model_dump(mode="json") for access in payload.cashbook_accesses
            ],
            actor=admin,
        )
        return admin_user_read(db, user)
    except UserServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{user_id}", response_model=AdminUserRead)
def update_user_endpoint(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, object]:
    user = _get_target_user(db, user_id)
    try:
        updated = update_user(
            db,
            user,
            username=payload.username,
            display_name=payload.display_name,
            role=payload.role,
            is_active=payload.is_active,
            actor=admin,
        )
        return admin_user_read(db, updated)
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
            actor=admin,
        )
    except UserServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MessageResponse(message="Passwort wurde zurückgesetzt.")


@router.put("/{user_id}/access", response_model=AdminUserRead)
def update_user_access(
    user_id: int,
    payload: UserCashbookAccessUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, object]:
    user = _get_target_user(db, user_id)
    try:
        return set_user_cashbook_accesses(
            db,
            user=user,
            accesses=[access.model_dump(mode="json") for access in payload.cashbook_accesses],
            actor=admin,
        )
    except UserServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{user_id}", response_model=MessageResponse)
def refuse_user_deletion(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> MessageResponse:
    _get_target_user(db, user_id)
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Benutzerkonten werden zum Schutz historischer Daten deaktiviert und nicht gelöscht.",
    )

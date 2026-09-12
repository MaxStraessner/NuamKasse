from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    require_cashbook_admin,
    require_cashbook_member,
    require_password_change_completed,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.cash_period import (
    CashPeriodCloseRequest,
    CashPeriodCloseResult,
    CashPeriodRead,
    CashPeriodStartRequest,
)
from app.schemas.cashbook import (
    CashbookCreate,
    CashbookListItem,
    CashbookMemberCandidateRead,
    CashbookMemberCreate,
    CashbookMembershipRead,
    CashbookRead,
)
from app.services.cashbook_service import (
    CashbookAccess,
    CashbookServiceError,
    add_cashbook_member,
    close_cashbook,
    create_cashbook,
    get_cashbook_access,
    list_cashbooks_for_user,
    list_cashbook_members,
    list_member_candidates,
    remove_cashbook_member,
    reopen_cashbook,
)

router = APIRouter(prefix="/cashbooks", tags=["cashbooks"])


def _service_error(exc: CashbookServiceError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _cashbook_admin_access(
    db: Session, user: User, cashbook_id: int
) -> CashbookAccess:
    access = get_cashbook_access(db, user, cashbook_id)
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "cashbook_membership_required",
                "message": "Dieser Benutzer ist dieser Kasse nicht zugeordnet.",
            },
        )
    if not access.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "cashbook_admin_required",
                "message": "Diese Funktion ist nur für den Administrator der Kasse verfügbar.",
            },
        )
    return access


@router.get("", response_model=list[CashbookListItem])
def read_cashbooks(
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
):
    return list_cashbooks_for_user(db, user)


@router.post("", response_model=CashbookRead, status_code=status.HTTP_201_CREATED)
def create_cashbook_endpoint(
    payload: CashbookCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
    active_cashbook_id: int | None = Header(default=None, alias="X-Cashbook-ID"),
):
    try:
        return create_cashbook(
            db,
            created_by=user,
            name=payload.name,
            opening_amount=payload.opening_amount,
            description=payload.description,
            template_cashbook_id=(
                payload.template_cashbook_id or active_cashbook_id
            ),
            member_user_ids=payload.member_user_ids,
            start_date=payload.start_date,
        )
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/{cashbook_id}/close", response_model=CashPeriodCloseResult)
def close_cashbook_endpoint(
    cashbook_id: int,
    payload: CashPeriodCloseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    access = _cashbook_admin_access(db, user, cashbook_id)
    try:
        closed_period, summary = close_cashbook(
            db,
            cashbook=access.cashbook,
            closed_by=user,
            end_date=payload.end_date,
        )
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc
    return {"closed_period": closed_period, "summary": summary}


@router.post("/{cashbook_id}/reopen", response_model=CashPeriodRead, status_code=status.HTTP_201_CREATED)
def reopen_cashbook_endpoint(
    cashbook_id: int,
    payload: CashPeriodStartRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
):
    access = _cashbook_admin_access(db, user, cashbook_id)
    try:
        return reopen_cashbook(
            db,
            cashbook=access.cashbook,
            opened_by=user,
            name=payload.name,
            start_date=payload.start_date,
        )
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/current", response_model=CashbookRead)
def read_current_cashbook(
    access: CashbookAccess = Depends(require_cashbook_member),
):
    return access.cashbook


@router.get("/current/members", response_model=list[CashbookMembershipRead])
def read_cashbook_members(
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
):
    return list_cashbook_members(db, access.cashbook.id)


@router.get("/current/member-candidates", response_model=list[CashbookMemberCandidateRead])
def read_member_candidates(
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
):
    return list_member_candidates(db, access.cashbook.id)


@router.post(
    "/current/members",
    response_model=CashbookMembershipRead,
    status_code=status.HTTP_201_CREATED,
)
def create_cashbook_member(
    payload: CashbookMemberCreate,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
):
    try:
        return add_cashbook_member(
            db,
            cashbook=access.cashbook,
            user_id=payload.user_id,
            actor=access.user,
        )
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc


@router.delete("/current/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cashbook_member(
    user_id: int,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
) -> Response:
    try:
        remove_cashbook_member(
            db,
            cashbook=access.cashbook,
            user_id=user_id,
            actor=access.user,
        )
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

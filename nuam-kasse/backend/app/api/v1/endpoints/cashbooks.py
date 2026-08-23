from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_cashbook_admin, require_cashbook_member
from app.db.session import get_db
from app.schemas.cashbook import (
    CashbookMemberCandidateRead,
    CashbookMemberCreate,
    CashbookMembershipRead,
    CashbookRead,
)
from app.services.cashbook_service import (
    CashbookAccess,
    CashbookServiceError,
    add_cashbook_member,
    list_cashbook_members,
    list_member_candidates,
    remove_cashbook_member,
)

router = APIRouter(prefix="/cashbooks", tags=["cashbooks"])


def _service_error(exc: CashbookServiceError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


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
    return list_member_candidates(db)


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
        return add_cashbook_member(db, cashbook=access.cashbook, user_id=payload.user_id)
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc


@router.delete("/current/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cashbook_member(
    user_id: int,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
) -> Response:
    try:
        remove_cashbook_member(db, cashbook=access.cashbook, user_id=user_id)
    except CashbookServiceError as exc:
        raise _service_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

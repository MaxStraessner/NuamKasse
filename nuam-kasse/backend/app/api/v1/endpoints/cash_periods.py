from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin, require_password_change_completed
from app.db.session import get_db
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.user import User
from app.schemas.cash_period import (
    CashPeriodCloseRequest,
    CashPeriodCreate,
    CashPeriodRead,
    CashPeriodSummary,
    CashPeriodUpdate,
)
from app.services.cash_period_service import (
    CashPeriodServiceError,
    close_cash_period,
    create_cash_period,
    get_active_cash_period,
    get_cash_period_by_id,
    list_cash_periods,
    update_cash_period,
)
from app.services.cash_summary_service import get_cash_period_summary

router = APIRouter(prefix="/cash-periods", tags=["cash-periods"])


def require_cash_period_admin(
    admin: User = Depends(require_admin),
    user: User = Depends(require_password_change_completed),
) -> User:
    return admin


def _service_error(exc: CashPeriodServiceError) -> HTTPException:
    status_code = status.HTTP_409_CONFLICT if exc.conflict else status.HTTP_400_BAD_REQUEST
    return HTTPException(
        status_code=status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _get_cash_period(db: Session, cash_period_id: int) -> CashPeriod:
    cash_period = get_cash_period_by_id(db, cash_period_id)
    if cash_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "cash_period_not_found", "message": "Kassenperiode nicht gefunden."},
        )
    return cash_period


def _get_active_or_404(db: Session) -> CashPeriod:
    cash_period = get_active_cash_period(db)
    if cash_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "no_active_cash_period",
                "message": "Es ist keine aktive Kassenperiode vorhanden.",
            },
        )
    return cash_period


@router.get("/current", response_model=CashPeriodRead)
def read_current_cash_period(
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> CashPeriod:
    return _get_active_or_404(db)


@router.get("/current/summary", response_model=CashPeriodSummary)
def read_current_cash_period_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    return get_cash_period_summary(db, _get_active_or_404(db))


@router.get("", response_model=list[CashPeriodRead])
def read_cash_periods(
    status_filter: CashPeriodStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_cash_period_admin),
) -> list[CashPeriod]:
    return list_cash_periods(db, status_filter=status_filter)


@router.get("/{cash_period_id}", response_model=CashPeriodRead)
def read_cash_period(
    cash_period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_cash_period_admin),
) -> CashPeriod:
    return _get_cash_period(db, cash_period_id)


@router.post("", response_model=CashPeriodRead, status_code=status.HTTP_201_CREATED)
def create_cash_period_endpoint(
    payload: CashPeriodCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_cash_period_admin),
) -> CashPeriod:
    try:
        return create_cash_period(
            db,
            name=payload.name,
            opening_amount=payload.opening_amount,
            currency=payload.currency,
            start_date=payload.start_date,
            end_date=payload.end_date,
            created_by=admin,
        )
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc


@router.patch("/{cash_period_id}", response_model=CashPeriodRead)
def update_cash_period_endpoint(
    cash_period_id: int,
    payload: CashPeriodUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_cash_period_admin),
) -> CashPeriod:
    cash_period = _get_cash_period(db, cash_period_id)
    try:
        return update_cash_period(db, cash_period, **payload.model_dump(exclude_unset=True))
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/{cash_period_id}/close", response_model=CashPeriodRead)
def close_cash_period_endpoint(
    cash_period_id: int,
    payload: CashPeriodCloseRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_cash_period_admin),
) -> CashPeriod:
    cash_period = _get_cash_period(db, cash_period_id)
    try:
        return close_cash_period(
            db,
            cash_period,
            closed_by=admin,
            end_date=payload.end_date,
        )
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc

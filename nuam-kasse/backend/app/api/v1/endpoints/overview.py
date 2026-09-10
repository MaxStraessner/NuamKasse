from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import ensure_cash_period_access, require_cashbook_member
from app.db.session import get_db
from app.schemas.overview import CashPeriodOverview, PaginatedOverviewExpenses
from app.services.overview_service import (
    OverviewServiceError,
    get_cash_period_overview,
    get_current_overview,
    get_overview_cash_period_by_id,
    list_cash_period_expenses,
)
from app.services.cashbook_service import CashbookAccess
from app.services.cash_period_service import get_active_cash_period

router = APIRouter(prefix="/overview", tags=["overview"])


def _service_error(exc: OverviewServiceError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/current", response_model=CashPeriodOverview)
def read_current_overview(
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> dict[str, object]:
    try:
        cash_period = get_active_cash_period(db, access.cashbook.id)
        if cash_period is not None:
            ensure_cash_period_access(db, access, cash_period)
        return get_current_overview(
            db,
            access.user,
            cashbook_id=access.cashbook.id,
            is_admin=access.is_admin,
        )
    except OverviewServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/cash-periods/{cash_period_id}", response_model=CashPeriodOverview)
def read_cash_period_overview(
    cash_period_id: int,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> dict[str, object]:
    try:
        cash_period = get_overview_cash_period_by_id(
            db, cash_period_id, cashbook_id=access.cashbook.id
        )
        ensure_cash_period_access(db, access, cash_period)
        return get_cash_period_overview(
            db, cash_period, user=access.user, is_admin=access.is_admin
        )
    except OverviewServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/cash-periods/{cash_period_id}/expenses", response_model=PaginatedOverviewExpenses)
def read_cash_period_expenses(
    cash_period_id: int,
    category_id: int | None = None,
    created_by_user_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    include_voided: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort: str = "created_at_desc",
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> dict[str, object]:
    try:
        cash_period = get_overview_cash_period_by_id(
            db, cash_period_id, cashbook_id=access.cashbook.id
        )
        ensure_cash_period_access(db, access, cash_period)
        return list_cash_period_expenses(
            db,
            cash_period=cash_period,
            user=access.user,
            cashbook_id=access.cashbook.id,
            is_admin=access.is_admin,
            category_id=category_id,
            created_by_user_id=created_by_user_id,
            date_from=date_from,
            date_to=date_to,
            include_voided=include_voided,
            limit=limit,
            offset=offset,
            sort=sort,
        )
    except OverviewServiceError as exc:
        raise _service_error(exc) from exc

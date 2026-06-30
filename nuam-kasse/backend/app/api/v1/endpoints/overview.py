from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin, require_password_change_completed
from app.db.session import get_db
from app.models.user import User
from app.schemas.overview import CashPeriodOverview, PaginatedOverviewExpenses
from app.services.overview_service import (
    OverviewServiceError,
    get_cash_period_overview,
    get_current_overview,
    get_overview_cash_period_by_id,
    list_cash_period_expenses,
)

router = APIRouter(prefix="/overview", tags=["overview"])


def require_overview_admin(
    admin: User = Depends(require_admin),
    user: User = Depends(require_password_change_completed),
) -> User:
    return admin


def _service_error(exc: OverviewServiceError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/current", response_model=CashPeriodOverview)
def read_current_overview(
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    try:
        return get_current_overview(db, user)
    except OverviewServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/cash-periods/{cash_period_id}", response_model=CashPeriodOverview)
def read_cash_period_overview(
    cash_period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_overview_admin),
) -> dict[str, object]:
    try:
        cash_period = get_overview_cash_period_by_id(db, cash_period_id)
        return get_cash_period_overview(db, cash_period, user=admin)
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
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    try:
        cash_period = get_overview_cash_period_by_id(db, cash_period_id)
        return list_cash_period_expenses(
            db,
            cash_period=cash_period,
            user=user,
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

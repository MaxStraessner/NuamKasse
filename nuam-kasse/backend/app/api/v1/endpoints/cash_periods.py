import re
import unicodedata
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    ensure_cash_period_access,
    require_cashbook_admin,
    require_cashbook_member,
)
from app.db.session import get_db
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.schemas.cash_period import (
    CashPeriodArchiveItem,
    CashPeriodCloseRequest,
    CashPeriodCloseResult,
    CashPeriodCreate,
    CashPeriodRead,
    CashPeriodStartRequest,
    CashPeriodSummary,
    CashPeriodUpdate,
)
from app.services.cashbook_service import CashbookAccess
from app.services.access_control_service import membership_can_access_cash_period
from app.services.cash_period_service import (
    CashPeriodServiceError,
    close_cash_period,
    create_cash_period,
    get_active_cash_period,
    get_cash_period_by_id,
    list_cash_periods_with_summaries,
    start_next_cash_period,
    update_cash_period,
)
from app.services.cash_summary_service import get_cash_period_summary
from app.services.cash_period_export_service import CashPeriodExportError, build_cash_period_export

router = APIRouter(prefix="/cash-periods", tags=["cash-periods"])


def _service_error(exc: CashPeriodServiceError) -> HTTPException:
    status_code = status.HTTP_409_CONFLICT if exc.conflict else status.HTTP_400_BAD_REQUEST
    if exc.code == "cash_period_not_found":
        status_code = status.HTTP_404_NOT_FOUND
    return HTTPException(
        status_code=status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _get_cash_period(db: Session, cash_period_id: int, access: CashbookAccess) -> CashPeriod:
    cash_period = get_cash_period_by_id(
        db, cash_period_id, cashbook_id=access.cashbook.id
    )
    if cash_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "cash_period_not_found", "message": "Kassenperiode nicht gefunden."},
        )
    ensure_cash_period_access(db, access, cash_period)
    return cash_period


def _get_active_or_404(db: Session, access: CashbookAccess) -> CashPeriod:
    cash_period = get_active_cash_period(db, access.cashbook.id)
    if cash_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "no_active_cash_period",
                "message": "Es ist keine aktive Kassenperiode vorhanden.",
            },
        )
    ensure_cash_period_access(db, access, cash_period)
    return cash_period


@router.get("/current", response_model=CashPeriodRead)
def read_current_cash_period(
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> CashPeriod:
    return _get_active_or_404(db, access)


@router.get("/current/summary", response_model=CashPeriodSummary)
def read_current_cash_period_summary(
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> dict[str, object]:
    return get_cash_period_summary(db, _get_active_or_404(db, access))


@router.get("", response_model=list[CashPeriodArchiveItem])
def read_cash_periods(
    status_filter: CashPeriodStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> list[CashPeriodArchiveItem]:
    return [
        CashPeriodArchiveItem.model_validate(
            {
                **CashPeriodRead.model_validate(item["cash_period"]).model_dump(),
                **{key: value for key, value in item.items() if key != "cash_period"},
            }
        )
        for item in list_cash_periods_with_summaries(
            db,
            cashbook_id=access.cashbook.id,
            status_filter=status_filter,
        )
        if membership_can_access_cash_period(db, access.membership, item["cash_period"])
    ]


@router.get("/{cash_period_id}", response_model=CashPeriodRead)
def read_cash_period(
    cash_period_id: int,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> CashPeriod:
    return _get_cash_period(db, cash_period_id, access)


@router.post("/start", response_model=CashPeriodRead, status_code=status.HTTP_201_CREATED)
def start_cash_period_endpoint(
    payload: CashPeriodStartRequest,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
) -> CashPeriod:
    try:
        return start_next_cash_period(
            db,
            cashbook=access.cashbook,
            created_by=access.user,
            name=payload.name,
            start_date=payload.start_date,
        )
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/{cash_period_id}/export.xlsx")
def export_cash_period(
    cash_period_id: int,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_member),
) -> StreamingResponse:
    cash_period = _get_cash_period(db, cash_period_id, access)
    try:
        workbook = build_cash_period_export(
            db, cashbook=access.cashbook, cash_period=cash_period
        )
    except CashPeriodExportError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "cash_period_export_unavailable", "message": str(exc)},
        ) from exc
    normalized_name = unicodedata.normalize("NFKD", access.cashbook.name).encode("ascii", "ignore").decode()
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", normalized_name).strip("_") or "Kasse"
    export_end = cash_period.end_date or date.today()
    filename = f"Nuam_Kasse_{safe_name}_{cash_period.start_date.isoformat()}_bis_{export_end.isoformat()}.xlsx"
    return StreamingResponse(
        workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=CashPeriodRead, status_code=status.HTTP_201_CREATED)
def create_cash_period_endpoint(
    payload: CashPeriodCreate,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
) -> CashPeriod:
    try:
        return create_cash_period(
            db,
            cashbook=access.cashbook,
            name=payload.name,
            opening_amount=payload.opening_amount,
            currency=payload.currency,
            start_date=payload.start_date,
            end_date=payload.end_date,
            created_by=access.user,
        )
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc


@router.patch("/{cash_period_id}", response_model=CashPeriodRead)
def update_cash_period_endpoint(
    cash_period_id: int,
    payload: CashPeriodUpdate,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
) -> CashPeriod:
    cash_period = _get_cash_period(db, cash_period_id, access)
    try:
        return update_cash_period(db, cash_period, **payload.model_dump(exclude_unset=True))
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/{cash_period_id}/close", response_model=CashPeriodCloseResult)
def close_cash_period_endpoint(
    cash_period_id: int,
    payload: CashPeriodCloseRequest,
    db: Session = Depends(get_db),
    access: CashbookAccess = Depends(require_cashbook_admin),
) -> dict[str, object]:
    _get_cash_period(db, cash_period_id, access)
    try:
        closed_period, summary = close_cash_period(
            db,
            cashbook=access.cashbook,
            cash_period_id=cash_period_id,
            closed_by=access.user,
            end_date=payload.end_date,
        )
    except CashPeriodServiceError as exc:
        raise _service_error(exc) from exc
    return {
        "closed_period": closed_period,
        "summary": summary,
    }

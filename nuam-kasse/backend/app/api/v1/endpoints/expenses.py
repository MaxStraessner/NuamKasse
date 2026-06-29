from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_password_change_completed
from app.db.session import get_db
from app.models.expense import Expense
from app.models.user import User
from app.schemas.expense import ExpenseCreate, ExpenseMutationResponse, ExpenseRead, ExpenseVoidRequest
from app.services.expense_service import (
    ExpenseServiceError,
    create_expense,
    get_expense_by_id,
    list_current_expenses,
    void_expense,
)

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _service_error(exc: ExpenseServiceError) -> HTTPException:
    detail = {"code": exc.code, "message": exc.message, **exc.extra}
    return HTTPException(status_code=exc.status_code, detail=detail)


def _get_expense(db: Session, expense_id: int) -> Expense:
    expense = get_expense_by_id(db, expense_id)
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "expense_not_found", "message": "Buchung nicht gefunden."},
        )
    return expense


@router.post("", response_model=ExpenseMutationResponse, status_code=status.HTTP_201_CREATED)
def create_expense_endpoint(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    try:
        expense, summary = create_expense(
            db,
            category_id=payload.category_id,
            amount=payload.amount,
            created_by=user,
        )
    except ExpenseServiceError as exc:
        raise _service_error(exc) from exc
    return {"expense": expense, "summary": summary}


@router.get("/current", response_model=list[ExpenseRead])
def read_current_expenses(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    category_id: int | None = None,
    created_by_user_id: int | None = None,
    include_voided: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> list[Expense]:
    try:
        return list_current_expenses(
            db,
            user=user,
            limit=limit,
            offset=offset,
            category_id=category_id,
            created_by_user_id=created_by_user_id,
            include_voided=include_voided,
        )
    except ExpenseServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/{expense_id}", response_model=ExpenseRead)
def read_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> Expense:
    return _get_expense(db, expense_id)


@router.post("/{expense_id}/void", response_model=ExpenseMutationResponse)
def void_expense_endpoint(
    expense_id: int,
    payload: ExpenseVoidRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    expense = _get_expense(db, expense_id)
    try:
        voided_expense, summary = void_expense(
            db,
            expense=expense,
            voided_by=user,
            reason=payload.reason,
        )
    except ExpenseServiceError as exc:
        raise _service_error(exc) from exc
    return {"expense": voided_expense, "summary": summary}

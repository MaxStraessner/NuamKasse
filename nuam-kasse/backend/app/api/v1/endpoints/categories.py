from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_password_change_completed
from app.db.session import get_db
from app.models.category import Category
from app.models.user import User
from app.schemas.category import (
    CategoryCatalogResponse,
    CategoryCreate,
    CategoryRead,
    CategoryReorderRequest,
    CategoryUpdate,
)
from app.services.category_service import (
    CategoryServiceError,
    create_category,
    delete_category,
    get_category_by_id,
    get_category_catalog,
    list_categories,
    reorder_categories,
    update_category,
)

router = APIRouter(prefix="/categories", tags=["categories"])


def _get_category(db: Session, category_id: int, user: User) -> Category:
    category = get_category_by_id(db, category_id, user_id=user.id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kategorie nicht gefunden.",
        )
    return category


@router.get("", response_model=list[CategoryRead])
def read_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> list[Category]:
    return list_categories(db, user=user, include_inactive=include_inactive)


@router.get("/catalog", response_model=CategoryCatalogResponse)
def read_category_catalog(
    user: User = Depends(require_password_change_completed),
) -> dict[str, object]:
    return get_category_catalog()


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category_endpoint(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> Category:
    try:
        return create_category(
            db,
            name=payload.name,
            icon_key=payload.icon_key,
            color_key=payload.color_key,
            user_id=user.id,
            parent_category_id=payload.parent_category_id,
            sort_order=payload.sort_order,
        )
    except CategoryServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/reorder", response_model=list[CategoryRead])
def reorder_categories_endpoint(
    payload: CategoryReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> list[Category]:
    try:
        return reorder_categories(
            db,
            user_id=user.id,
            category_ids=payload.category_ids,
            parent_category_id=payload.parent_category_id,
        )
    except CategoryServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{category_id}/archive", response_model=CategoryRead)
def archive_category_endpoint(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> Category:
    category = _get_category(db, category_id, user)
    try:
        return update_category(db, category, is_active=False)
    except CategoryServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{category_id}/restore", response_model=CategoryRead)
def restore_category_endpoint(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> Category:
    category = _get_category(db, category_id, user)
    try:
        return update_category(db, category, is_active=True)
    except CategoryServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category_endpoint(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> None:
    category = _get_category(db, category_id, user)
    try:
        delete_category(db, category=category)
    except CategoryServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category_endpoint(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_password_change_completed),
) -> Category:
    category = _get_category(db, category_id, user)
    update_data = payload.model_dump(exclude_unset=True)
    try:
        return update_category(db, category, **update_data)
    except CategoryServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.cashbook import Cashbook, CashbookMembership, CashbookRole
from app.models.user import User, UserRole


class CashbookServiceError(ValueError):
    def __init__(self, message: str, *, code: str = "cashbook_error", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class CashbookAccess:
    user: User
    membership: CashbookMembership
    cashbook: Cashbook

    @property
    def is_admin(self) -> bool:
        return self.membership.role == CashbookRole.admin


def get_membership_for_user(db: Session, user_id: int) -> CashbookMembership | None:
    return db.scalar(
        select(CashbookMembership).where(CashbookMembership.user_id == user_id)
    )


def get_cashbook_access(db: Session, user: User) -> CashbookAccess | None:
    membership = get_membership_for_user(db, user.id)
    if membership is None:
        return None
    cashbook = db.get(Cashbook, membership.cashbook_id)
    if cashbook is None:
        return None
    return CashbookAccess(user=user, membership=membership, cashbook=cashbook)


def bootstrap_first_cashbook(db: Session, user: User) -> CashbookMembership | None:
    if get_membership_for_user(db, user.id) is not None:
        return get_membership_for_user(db, user.id)
    if int(db.scalar(select(func.count(Cashbook.id))) or 0) > 0:
        return None
    if user.role != UserRole.admin:
        return None
    cashbook = Cashbook(name="Nuam Kasse", currency="THB", created_by_user_id=user.id)
    db.add(cashbook)
    db.flush()
    membership = CashbookMembership(
        cashbook_id=cashbook.id,
        user_id=user.id,
        role=CashbookRole.admin,
    )
    db.add(membership)
    return membership


def list_cashbook_members(db: Session, cashbook_id: int) -> list[CashbookMembership]:
    return list(
        db.scalars(
            select(CashbookMembership)
            .join(User, User.id == CashbookMembership.user_id)
            .where(CashbookMembership.cashbook_id == cashbook_id)
            .order_by(
                CashbookMembership.role.asc(),
                User.display_name.asc(),
                User.id.asc(),
            )
        )
    )


def list_member_candidates(db: Session) -> list[User]:
    assigned_user_ids = select(CashbookMembership.user_id)
    return list(
        db.scalars(
            select(User)
            .where(
                User.is_active.is_(True),
                User.id.not_in(assigned_user_ids),
            )
            .order_by(User.display_name.asc(), User.id.asc())
        )
    )


def add_cashbook_member(db: Session, *, cashbook: Cashbook, user_id: int) -> CashbookMembership:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise CashbookServiceError(
            "Benutzer nicht gefunden.", code="user_not_found", status_code=404
        )
    if get_membership_for_user(db, user.id) is not None:
        raise CashbookServiceError(
            "Dieser Benutzer gehört bereits einer Kasse an.",
            code="membership_exists",
            status_code=409,
        )
    membership = CashbookMembership(
        cashbook_id=cashbook.id,
        user_id=user.id,
        role=CashbookRole.member,
    )
    db.add(membership)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CashbookServiceError(
            "Dieser Benutzer gehört bereits einer Kasse an.",
            code="membership_exists",
            status_code=409,
        ) from exc
    db.refresh(membership)
    return membership


def remove_cashbook_member(
    db: Session,
    *,
    cashbook: Cashbook,
    user_id: int,
) -> None:
    membership = db.scalar(
        select(CashbookMembership).where(
            CashbookMembership.cashbook_id == cashbook.id,
            CashbookMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise CashbookServiceError(
            "Mitglied nicht gefunden.", code="membership_not_found", status_code=404
        )
    if membership.role == CashbookRole.admin:
        raise CashbookServiceError(
            "Der Administrator der Kasse kann nicht entfernt werden.",
            code="cashbook_admin_required",
            status_code=409,
        )
    db.delete(membership)
    db.commit()

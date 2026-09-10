from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.money import MoneyError, parse_money
from app.models.cashbook import Cashbook, CashbookMembership, CashbookRole
from app.models.cash_period import CashPeriod, CashPeriodStatus
from app.models.user import User, UserRole
from app.services.category_service import stage_default_categories_for_cashbook
from app.services.cash_summary_service import get_cash_period_summary
from app.services.access_control_service import membership_can_access_cash_period
from app.services.audit_service import record_admin_action


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


def get_membership_for_user(
    db: Session, user_id: int, cashbook_id: int | None = None
) -> CashbookMembership | None:
    query = select(CashbookMembership).where(CashbookMembership.user_id == user_id)
    if cashbook_id is not None:
        query = query.where(CashbookMembership.cashbook_id == cashbook_id)
    return db.scalar(query.order_by(CashbookMembership.id.asc()))


def get_cashbook_access(
    db: Session, user: User, cashbook_id: int | None = None
) -> CashbookAccess | None:
    membership = get_membership_for_user(db, user.id, cashbook_id)
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
    cashbook = Cashbook(
        name="Nuam Kasse",
        currency="THB",
        created_by_user_id=user.id,
        category_owner_user_id=user.id,
    )
    db.add(cashbook)
    db.flush()
    stage_default_categories_for_cashbook(
        db,
        cashbook_id=cashbook.id,
        category_owner_user_id=user.id,
    )
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


def list_member_candidates(db: Session, cashbook_id: int) -> list[User]:
    assigned_user_ids = select(CashbookMembership.user_id).where(
        CashbookMembership.cashbook_id == cashbook_id
    )
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


def add_cashbook_member(
    db: Session,
    *,
    cashbook: Cashbook,
    user_id: int,
    actor: User | None = None,
) -> CashbookMembership:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise CashbookServiceError(
            "Benutzer nicht gefunden.", code="user_not_found", status_code=404
        )
    if get_membership_for_user(db, user.id, cashbook.id) is not None:
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
    db.flush()
    record_admin_action(
        db,
        actor=actor,
        target=user,
        action="user.cashbook_access_changed",
        details={"cashbook_id": cashbook.id, "change": "added", "period_access_mode": "all"},
    )
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


def list_cashbooks_for_user(db: Session, user: User) -> list[dict[str, object]]:
    memberships = list(
        db.scalars(
            select(CashbookMembership)
            .where(CashbookMembership.user_id == user.id)
            .order_by(CashbookMembership.id.asc())
        )
    )
    result: list[dict[str, object]] = []
    for membership in memberships:
        cashbook = membership.cashbook
        active_period = db.scalar(
            select(CashPeriod).where(
                CashPeriod.cashbook_id == cashbook.id,
                CashPeriod.status == CashPeriodStatus.active,
            )
        )
        current_balance = "0.00"
        visible_active_period = (
            active_period
            if active_period is not None
            and membership_can_access_cash_period(db, membership, active_period)
            else None
        )
        if visible_active_period is not None:
            current_balance = str(get_cash_period_summary(db, active_period)["remaining_amount"])
        result.append(
            {
                "id": cashbook.id,
                "name": cashbook.name,
                "description": cashbook.description,
                "currency": cashbook.currency,
                "role": membership.role,
                "current_balance": current_balance,
                "active_period_id": visible_active_period.id if visible_active_period else None,
            }
        )
    return result


def create_cashbook(
    db: Session,
    *,
    created_by: User,
    name: str,
    opening_amount: str | Decimal,
    description: str | None = None,
    member_user_ids: list[int] | None = None,
    start_date: date | None = None,
) -> Cashbook:
    clean_name = name.strip()
    if not clean_name:
        raise CashbookServiceError("Der Name der Kasse darf nicht leer sein.")
    clean_description = description.strip() if description else None
    if clean_description and len(clean_description) > 1000:
        raise CashbookServiceError("Die Beschreibung darf höchstens 1000 Zeichen lang sein.")
    try:
        amount = parse_money(opening_amount)
    except MoneyError as exc:
        raise CashbookServiceError(str(exc)) from exc

    requested_ids = set(member_user_ids or [])
    requested_ids.discard(created_by.id)
    members = list(db.scalars(select(User).where(User.id.in_(requested_ids)))) if requested_ids else []
    if len(members) != len(requested_ids) or any(not member.is_active for member in members):
        raise CashbookServiceError(
            "Mindestens ein ausgewählter Benutzer ist nicht verfügbar.",
            code="cashbook_member_invalid",
            status_code=400,
        )

    cashbook = Cashbook(
        name=clean_name,
        description=clean_description,
        currency="THB",
        created_by_user_id=created_by.id,
        category_owner_user_id=created_by.id,
    )
    db.add(cashbook)
    db.flush()
    stage_default_categories_for_cashbook(
        db,
        cashbook_id=cashbook.id,
        category_owner_user_id=created_by.id,
    )
    db.add(
        CashbookMembership(
            cashbook_id=cashbook.id,
            user_id=created_by.id,
            role=CashbookRole.admin,
        )
    )
    for member in members:
        db.add(
            CashbookMembership(
                cashbook_id=cashbook.id,
                user_id=member.id,
                role=CashbookRole.member,
            )
        )
        record_admin_action(
            db,
            actor=created_by,
            target=member,
            action="user.cashbook_access_changed",
            details={"cashbook_id": cashbook.id, "change": "added", "period_access_mode": "all"},
        )
    period_start = start_date or date.today()
    period = CashPeriod(
        cashbook_id=cashbook.id,
        name=f"Start {period_start:%d.%m.%Y}",
        opening_amount=amount,
        currency=cashbook.currency,
        start_date=period_start,
        status=CashPeriodStatus.active,
        created_by_user_id=created_by.id,
    )
    db.add(period)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CashbookServiceError(
            "Die Kasse konnte nicht angelegt werden.",
            code="cashbook_create_conflict",
            status_code=409,
        ) from exc
    db.refresh(cashbook)
    return cashbook


def remove_cashbook_member(
    db: Session,
    *,
    cashbook: Cashbook,
    user_id: int,
    actor: User | None = None,
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
    target = membership.user
    record_admin_action(
        db,
        actor=actor,
        target=target,
        action="user.cashbook_access_changed",
        details={"cashbook_id": cashbook.id, "change": "removed"},
    )
    db.delete(membership)
    db.commit()

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalize_username, validate_password
from app.models.access_control import CashPeriodPermission
from app.models.cashbook import Cashbook, CashbookMembership, CashbookRole, PeriodAccessMode
from app.models.cash_period import CashPeriod
from app.models.user import User, UserRole
from app.models.user_session import UserSession
from app.services.access_control_service import accessible_period_ids, current_and_future_boundary
from app.services.audit_service import record_admin_action
from app.services.cashbook_service import bootstrap_first_cashbook


class UserServiceError(ValueError):
    pass


def get_user_by_normalized_username(db: Session, username: str) -> User | None:
    normalized = normalize_username(username)
    return db.scalar(select(User).where(User.username_normalized == normalized))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def _validate_username(username: str) -> tuple[str, str]:
    username = username.strip()
    normalized = normalize_username(username)
    if not username:
        raise UserServiceError("Der Benutzername darf nicht leer sein.")
    if not normalized:
        raise UserServiceError("Der Benutzername darf nicht leer sein.")
    return username, normalized


def _validate_display_name(display_name: str) -> str:
    display_name = display_name.strip()
    if not display_name:
        raise UserServiceError("Der Anzeigename darf nicht leer sein.")
    return display_name


def ensure_unique_username(
    db: Session,
    username: str,
    exclude_user_id: int | None = None,
) -> tuple[str, str]:
    username, normalized = _validate_username(username)
    query = select(User).where(User.username_normalized == normalized)
    existing = db.scalar(query)
    if existing and existing.id != exclude_user_id:
        raise UserServiceError("Dieser Benutzername ist bereits vergeben.")
    return username, normalized


def ensure_password_confirmation(password: str, confirmation: str) -> None:
    if password != confirmation:
        raise UserServiceError("Die Passwortbestätigung stimmt nicht überein.")
    try:
        validate_password(password)
    except ValueError as exc:
        raise UserServiceError(str(exc)) from exc


def create_user(
    db: Session,
    *,
    username: str,
    display_name: str,
    password: str,
    password_confirmation: str,
    role: UserRole,
    is_active: bool = True,
    must_change_password: bool = True,
    cashbook_accesses: list[dict[str, object]] | None = None,
    actor: User | None = None,
) -> User:
    username, normalized = ensure_unique_username(db, username)
    display_name = _validate_display_name(display_name)
    ensure_password_confirmation(password, password_confirmation)

    user = User(
        username=username,
        username_normalized=normalized,
        display_name=display_name,
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.flush()
    bootstrap_first_cashbook(db, user)
    if cashbook_accesses:
        _apply_cashbook_accesses(
            db,
            user=user,
            accesses=cashbook_accesses,
            actor=actor,
            record_audit=actor is not None,
        )
    record_admin_action(
        db,
        actor=actor,
        target=user,
        action="user.created" if actor is not None else "user.bootstrap",
        details={"role": role.value, "is_active": is_active},
    )
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.asc(), User.id.asc())))


def _cashbook_access_read(db: Session, membership: CashbookMembership) -> dict[str, object]:
    periods = list(
        db.scalars(
            select(CashPeriod)
            .where(CashPeriod.cashbook_id == membership.cashbook_id)
            .order_by(CashPeriod.start_date.desc(), CashPeriod.id.desc())
        )
    )
    period_ids = accessible_period_ids(db, membership, periods)
    return {
        "cashbook_id": membership.cashbook_id,
        "cashbook_name": membership.cashbook.name,
        "cashbook_role": membership.role,
        "period_access_mode": membership.period_access_mode,
        "period_access_from": membership.period_access_from,
        "accessible_period_ids": period_ids,
        "accessible_period_count": len(period_ids),
        "available_period_count": len(periods),
    }


def admin_user_read(db: Session, user: User) -> dict[str, object]:
    memberships = list(
        db.scalars(
            select(CashbookMembership)
            .where(CashbookMembership.user_id == user.id)
            .order_by(CashbookMembership.cashbook_id.asc())
        )
    )
    accesses = [_cashbook_access_read(db, membership) for membership in memberships]
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
        "cashbook_accesses": accesses,
        "cashbook_count": len(accesses),
        "accessible_period_count": sum(int(access["accessible_period_count"]) for access in accesses),
    }


def list_admin_users(db: Session) -> list[dict[str, object]]:
    return [admin_user_read(db, user) for user in list_users(db)]


def list_cashbook_access_options(db: Session) -> list[dict[str, object]]:
    cashbooks = list(db.scalars(select(Cashbook).order_by(Cashbook.name.asc(), Cashbook.id.asc())))
    result: list[dict[str, object]] = []
    for cashbook in cashbooks:
        periods = list(
            db.scalars(
                select(CashPeriod)
                .where(CashPeriod.cashbook_id == cashbook.id)
                .order_by(CashPeriod.start_date.desc(), CashPeriod.id.desc())
            )
        )
        result.append(
            {
                "id": cashbook.id,
                "name": cashbook.name,
                "periods": [
                    {
                        "id": period.id,
                        "name": period.name,
                        "start_date": period.start_date,
                        "end_date": period.end_date,
                        "status": period.status.value,
                    }
                    for period in periods
                ],
            }
        )
    return result


def active_admin_count(db: Session, exclude_user_id: int | None = None) -> int:
    query = select(func.count()).select_from(User).where(
        User.role == UserRole.admin,
        User.is_active.is_(True),
    )
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    return int(db.scalar(query) or 0)


def _lock_active_admins(db: Session) -> None:
    list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.admin, User.is_active.is_(True))
            .with_for_update()
        )
    )


def delete_user_sessions(db: Session, user_id: int, keep_session_id: int | None = None) -> None:
    query = select(UserSession).where(UserSession.user_id == user_id)
    if keep_session_id is not None:
        query = query.where(UserSession.id != keep_session_id)
    for session in db.scalars(query):
        db.delete(session)


def update_user(
    db: Session,
    user: User,
    *,
    username: str | None = None,
    display_name: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    actor: User | None = None,
) -> User:
    target_role = role if role is not None else user.role
    target_active = is_active if is_active is not None else user.is_active

    if user.role == UserRole.admin and user.is_active:
        _lock_active_admins(db)
        would_remove_admin = target_role != UserRole.admin or not target_active
        if would_remove_admin and active_admin_count(db, exclude_user_id=user.id) == 0:
            raise UserServiceError("Der letzte aktive Administrator muss erhalten bleiben.")

    if user.is_active and not target_active:
        admin_memberships = list(
            db.scalars(
                select(CashbookMembership).where(
                    CashbookMembership.user_id == user.id,
                    CashbookMembership.role == CashbookRole.admin,
                )
            )
        )
        for membership in admin_memberships:
            _ensure_cashbook_admin_can_be_removed(db, membership)

    previous_username = user.username
    previous_display_name = user.display_name
    previous_role = user.role
    previous_active = user.is_active

    if username is not None:
        clean_username, normalized = ensure_unique_username(
            db,
            username,
            exclude_user_id=user.id,
        )
        user.username = clean_username
        user.username_normalized = normalized

    if display_name is not None:
        user.display_name = _validate_display_name(display_name)

    if role is not None:
        user.role = role

    if is_active is not None:
        user.is_active = is_active
        if not is_active:
            delete_user_sessions(db, user.id)

    if user.username != previous_username:
        record_admin_action(
            db,
            actor=actor,
            target=user,
            action="user.username_changed",
            details={"from": previous_username, "to": user.username},
        )
    if user.display_name != previous_display_name:
        record_admin_action(
            db,
            actor=actor,
            target=user,
            action="user.display_name_changed",
            details={"from": previous_display_name, "to": user.display_name},
        )
    if user.role != previous_role:
        record_admin_action(
            db,
            actor=actor,
            target=user,
            action="user.role_changed",
            details={"from": previous_role.value, "to": user.role.value},
        )
    if user.is_active != previous_active:
        record_admin_action(
            db,
            actor=actor,
            target=user,
            action="user.activated" if user.is_active else "user.deactivated",
            details={"is_active": user.is_active},
        )

    db.commit()
    db.refresh(user)
    return user


def reset_user_password(
    db: Session,
    user: User,
    *,
    new_password: str,
    new_password_confirmation: str,
    actor: User | None = None,
    must_change_password: bool = True,
) -> None:
    ensure_password_confirmation(new_password, new_password_confirmation)
    user.password_hash = hash_password(new_password)
    user.must_change_password = must_change_password
    delete_user_sessions(db, user.id)
    record_admin_action(
        db,
        actor=actor,
        target=user,
        action="user.password_reset",
        details={"sessions_revoked": True, "must_change_password": must_change_password},
    )
    db.commit()


def _ensure_cashbook_admin_can_be_removed(
    db: Session,
    membership: CashbookMembership,
) -> None:
    if membership.role != CashbookRole.admin or not membership.user.is_active:
        return
    active_admin_memberships = list(
        db.scalars(
            select(CashbookMembership)
            .join(User, User.id == CashbookMembership.user_id)
            .where(
                CashbookMembership.cashbook_id == membership.cashbook_id,
                CashbookMembership.role == CashbookRole.admin,
                User.is_active.is_(True),
            )
            .order_by(CashbookMembership.id.asc())
            .with_for_update(of=CashbookMembership)
        )
    )
    if not any(item.id != membership.id for item in active_admin_memberships):
        raise UserServiceError(
            f"Die letzte aktive Kassenadministration für '{membership.cashbook.name}' muss erhalten bleiben."
        )


def _apply_cashbook_accesses(
    db: Session,
    *,
    user: User,
    accesses: list[dict[str, object]],
    actor: User | None,
    record_audit: bool,
) -> None:
    requested_ids = [int(access["cashbook_id"]) for access in accesses]
    if len(requested_ids) != len(set(requested_ids)):
        raise UserServiceError("Jede Kasse darf nur einmal zugewiesen werden.")

    cashbooks = {
        cashbook.id: cashbook
        for cashbook in db.scalars(select(Cashbook).where(Cashbook.id.in_(requested_ids)))
    } if requested_ids else {}
    if len(cashbooks) != len(requested_ids):
        raise UserServiceError("Mindestens eine ausgewählte Kasse wurde nicht gefunden.")

    existing = {
        membership.cashbook_id: membership
        for membership in db.scalars(
            select(CashbookMembership).where(CashbookMembership.user_id == user.id)
        )
    }
    requested_id_set = set(requested_ids)
    existing_id_set = set(existing)
    cashbook_access_changed = requested_id_set != existing_id_set
    period_access_changed = requested_id_set != existing_id_set
    resulting_roles: dict[int, CashbookRole] = {}

    for cashbook_id, membership in existing.items():
        if cashbook_id not in cashbooks:
            _ensure_cashbook_admin_can_be_removed(db, membership)
            db.delete(membership)

    for access in accesses:
        cashbook_id = int(access["cashbook_id"])
        raw_mode = access.get("period_access_mode", PeriodAccessMode.all.value)
        mode = raw_mode if isinstance(raw_mode, PeriodAccessMode) else PeriodAccessMode(str(raw_mode))
        raw_role = access.get("cashbook_role")
        requested_period_ids = {int(period_id) for period_id in access.get("period_ids", [])}
        periods = list(
            db.scalars(select(CashPeriod).where(CashPeriod.id.in_(requested_period_ids)))
        ) if requested_period_ids else []
        if len(periods) != len(requested_period_ids) or any(
            period.cashbook_id != cashbook_id for period in periods
        ):
            raise UserServiceError("Eine Periodenzuweisung gehört nicht zur ausgewählten Kasse.")

        membership = existing.get(cashbook_id)
        if membership is None:
            cashbook_role = (
                CashbookRole.member
                if raw_role is None
                else raw_role
                if isinstance(raw_role, CashbookRole)
                else CashbookRole(str(raw_role))
            )
            membership = CashbookMembership(
                cashbook_id=cashbook_id,
                user_id=user.id,
                role=cashbook_role,
            )
            db.add(membership)
            db.flush()
            previous_mode = None
            previous_from = None
            previous_period_ids: set[int] = set()
        else:
            cashbook_role = (
                membership.role
                if raw_role is None
                else raw_role
                if isinstance(raw_role, CashbookRole)
                else CashbookRole(str(raw_role))
            )
            if membership.role != cashbook_role:
                if membership.role == CashbookRole.admin:
                    _ensure_cashbook_admin_can_be_removed(db, membership)
                cashbook_access_changed = True
            previous_mode = membership.period_access_mode
            previous_from = membership.period_access_from
            previous_period_ids = {
                permission.cash_period_id for permission in membership.period_permissions
            }

        membership.role = cashbook_role
        resulting_roles[cashbook_id] = cashbook_role
        membership.period_access_mode = mode
        if mode == PeriodAccessMode.current_and_future:
            if previous_mode != mode or membership.period_access_from is None:
                membership.period_access_from = current_and_future_boundary(db, cashbook_id)
        else:
            membership.period_access_from = None

        for permission in list(membership.period_permissions):
            db.delete(permission)
        db.flush()
        if mode == PeriodAccessMode.selected:
            for period_id in sorted(requested_period_ids):
                db.add(
                    CashPeriodPermission(
                        membership_id=membership.id,
                        cash_period_id=period_id,
                        created_by_user_id=actor.id if actor is not None else None,
                    )
                )

        if (
            previous_mode != mode
            or previous_period_ids != (
                requested_period_ids if mode == PeriodAccessMode.selected else set()
            )
            or (
                mode == PeriodAccessMode.current_and_future
                and previous_from != membership.period_access_from
            )
        ):
            period_access_changed = True

    if record_audit and cashbook_access_changed:
        record_admin_action(
            db,
            actor=actor,
            target=user,
            action="user.cashbook_access_changed",
            details={
                "cashbooks": [
                    {
                        "cashbook_id": int(access["cashbook_id"]),
                        "cashbook_role": resulting_roles[int(access["cashbook_id"])].value,
                    }
                    for access in accesses
                ]
            },
        )
    if record_audit and period_access_changed:
        record_admin_action(
            db,
            actor=actor,
            target=user,
            action="user.period_access_changed",
            details={
                "cashbooks": [
                    {
                        "cashbook_id": int(access["cashbook_id"]),
                        "period_access_mode": (
                            access["period_access_mode"].value
                            if isinstance(access.get("period_access_mode"), PeriodAccessMode)
                            else str(access.get("period_access_mode", "all"))
                        ),
                        "period_count": len(access.get("period_ids", [])),
                    }
                    for access in accesses
                ]
            },
        )


def set_user_cashbook_accesses(
    db: Session,
    *,
    user: User,
    accesses: list[dict[str, object]],
    actor: User,
) -> dict[str, object]:
    _apply_cashbook_accesses(
        db,
        user=user,
        accesses=accesses,
        actor=actor,
        record_audit=True,
    )
    db.commit()
    db.refresh(user)
    return admin_user_read(db, user)

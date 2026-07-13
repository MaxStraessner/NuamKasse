from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalize_username, validate_password
from app.models.user import User, UserRole
from app.models.user_session import UserSession


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
    must_change_password: bool = True,
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
        is_active=True,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.asc(), User.id.asc())))


def active_admin_count(db: Session, exclude_user_id: int | None = None) -> int:
    query = select(func.count()).select_from(User).where(
        User.role == UserRole.admin,
        User.is_active.is_(True),
    )
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    return int(db.scalar(query) or 0)


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
) -> User:
    target_role = role if role is not None else user.role
    target_active = is_active if is_active is not None else user.is_active

    if user.role == UserRole.admin and user.is_active:
        would_remove_admin = target_role != UserRole.admin or not target_active
        if would_remove_admin and active_admin_count(db, exclude_user_id=user.id) == 0:
            raise UserServiceError("Der letzte aktive Administrator muss erhalten bleiben.")

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

    db.commit()
    db.refresh(user)
    return user


def reset_user_password(
    db: Session,
    user: User,
    *,
    new_password: str,
    new_password_confirmation: str,
) -> None:
    ensure_password_confirmation(new_password, new_password_confirmation)
    user.password_hash = hash_password(new_password)
    user.must_change_password = True
    delete_user_sessions(db, user.id)
    db.commit()

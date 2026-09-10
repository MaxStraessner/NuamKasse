from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User


def record_admin_action(
    db: Session,
    *,
    actor: User | None,
    target: User | None,
    action: str,
    details: dict[str, object] | None = None,
) -> AdminAuditLog:
    event = AdminAuditLog(
        actor_user_id=actor.id if actor is not None else None,
        target_user_id=target.id if target is not None else None,
        action=action,
        details=details,
    )
    db.add(event)
    return event


def list_admin_audit_logs(
    db: Session,
    *,
    target_user_id: int | None = None,
    limit: int = 100,
) -> list[dict[str, object]]:
    query = select(AdminAuditLog)
    if target_user_id is not None:
        query = query.where(AdminAuditLog.target_user_id == target_user_id)
    events = list(
        db.scalars(
            query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(limit)
        )
    )
    result: list[dict[str, object]] = []
    for event in events:
        actor = db.get(User, event.actor_user_id) if event.actor_user_id is not None else None
        target = db.get(User, event.target_user_id) if event.target_user_id is not None else None
        result.append(
            {
                "id": event.id,
                "actor_user_id": event.actor_user_id,
                "actor_username": actor.username if actor is not None else None,
                "target_user_id": event.target_user_id,
                "target_username": target.username if target is not None else None,
                "action": event.action,
                "details": event.details,
                "created_at": event.created_at,
            }
        )
    return result

"""Admin audit log API."""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import false
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.db.session import get_db
from app.models.models import AuditEvent, User

router = APIRouter()


@router.get("/filters")
def get_audit_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get distinct usernames and actions for filter dropdowns (admin only)."""
    user_ids = db.query(AuditEvent.user_id).filter(AuditEvent.user_id.isnot(None)).distinct().all()
    usernames = []
    for (uid,) in user_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            usernames.append(u.username)
    usernames = sorted(set(usernames))
    actions = sorted(
        set(a[0] for a in db.query(AuditEvent.action_type).distinct().all() if a[0])
    )
    return {"users": usernames, "actions": actions}


@router.get("")
def list_audit_events(
    user_id: UUID | None = Query(None, description="Filter by user ID"),
    username: str | None = Query(None, description="Filter by username"),
    action_type: str | None = Query(None, description="Filter by action type (partial match)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List audit events with filters and pagination (admin only)."""
    q = db.query(AuditEvent).order_by(AuditEvent.created_at.desc())
    if user_id:
        q = q.filter(AuditEvent.user_id == user_id)
    if username:
        u = db.query(User).filter(User.username == username).first()
        if u:
            q = q.filter(AuditEvent.user_id == u.id)
        else:
            q = q.filter(false())
    if action_type:
        q = q.filter(AuditEvent.action_type.ilike(f"%{action_type}%"))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()

    users_by_id: dict[UUID, str] = {}
    for r in rows:
        if r.user_id and r.user_id not in users_by_id:
            u = db.query(User).filter(User.id == r.user_id).first()
            users_by_id[r.user_id] = u.username if u else "unknown"

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": [
            {
                "id": str(r.id),
                "timestamp": r.created_at.isoformat(),
                "user_id": str(r.user_id) if r.user_id else None,
                "user": users_by_id.get(r.user_id, "system") if r.user_id else "system",
                "action": r.action_type,
                "target_type": r.record_type,
                "target_id": str(r.record_id) if r.record_id else None,
                "target_name": _target_name(r),
                "details": _format_details(r),
                "ip": r.ip_address or "",
            }
            for r in rows
        ],
    }


def _target_name(r: AuditEvent) -> str | None:
    if r.after_json and isinstance(r.after_json, dict) and "username" in r.after_json:
        return r.after_json.get("username")
    if r.before_json and isinstance(r.before_json, dict) and "username" in r.before_json:
        return r.before_json.get("username")
    if r.after_json and isinstance(r.after_json, dict) and "name" in r.after_json:
        return r.after_json.get("name")
    if r.before_json and isinstance(r.before_json, dict) and "name" in r.before_json:
        return r.before_json.get("name")
    return None


def _format_details(r: AuditEvent) -> str | None:
    parts = []
    if r.before_json and isinstance(r.before_json, dict):
        parts.append(str(r.before_json))
    if r.after_json and isinstance(r.after_json, dict):
        parts.append(str(r.after_json))
    if not parts:
        return None
    return " | ".join(parts)

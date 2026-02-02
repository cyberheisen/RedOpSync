"""Audit logging for vulnerability and related actions."""
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.models import AuditEvent


def log_audit(
    db: Session,
    *,
    project_id: UUID | None = None,
    user_id: UUID | None = None,
    action_type: str,
    record_type: str | None = None,
    record_id: UUID | None = None,
    before_json: dict | None = None,
    after_json: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Record an audit event."""
    ev = AuditEvent(
        project_id=project_id,
        user_id=user_id,
        action_type=action_type,
        record_type=record_type,
        record_id=record_id,
        before_json=before_json,
        after_json=after_json,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(ev)

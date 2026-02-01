"""Lock service: acquire, release, renew, and enforce record-level locks."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import Lock, User

LOCKABLE_RECORD_TYPES = frozenset({"host", "port", "subnet", "note", "vulnerability_instance"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expires_at() -> datetime:
    return _now() + timedelta(seconds=settings.lock_ttl_seconds)


def get_lock(
    db: Session,
    project_id: UUID,
    record_type: str,
    record_id: UUID,
) -> Lock | None:
    """Return active lock for a record, or None if unlocked or expired."""
    lock = (
        db.query(Lock)
        .filter(
            Lock.project_id == project_id,
            Lock.record_type == record_type,
            Lock.record_id == record_id,
            Lock.expires_at > _now(),
        )
        .first()
    )
    return lock


def acquire_lock(
    db: Session,
    project_id: UUID,
    record_type: str,
    record_id: UUID,
    user: User,
) -> Lock:
    """Acquire lock on a record. Replaces own lock, raises if locked by another user."""
    if record_type not in LOCKABLE_RECORD_TYPES:
        raise ValueError(f"Invalid record_type: {record_type}")

    existing = get_lock(db, project_id, record_type, record_id)
    if existing:
        if existing.locked_by_user_id != user.id:
            raise PermissionError(f"Record locked by another user")
        # Renew own lock
        existing.expires_at = _expires_at()
        db.commit()
        db.refresh(existing)
        return existing

    lock = Lock(
        project_id=project_id,
        record_type=record_type,
        record_id=record_id,
        locked_by_user_id=user.id,
        expires_at=_expires_at(),
    )
    db.add(lock)
    db.commit()
    db.refresh(lock)
    return lock


def release_lock(
    db: Session,
    lock_id: UUID,
    user: User,
) -> bool:
    """Release a lock. Returns True if released, False if not found or not owned."""
    lock = db.query(Lock).filter(Lock.id == lock_id).first()
    if not lock or lock.locked_by_user_id != user.id:
        return False
    db.delete(lock)
    db.commit()
    return True


def renew_lock(
    db: Session,
    lock_id: UUID,
    user: User,
) -> Lock | None:
    """Renew a lock, extending expiry. Returns lock or None if not found/expired/not owned."""
    lock = db.query(Lock).filter(Lock.id == lock_id).first()
    if not lock or lock.locked_by_user_id != user.id or lock.expires_at <= _now():
        return None
    lock.expires_at = _expires_at()
    db.commit()
    db.refresh(lock)
    return lock


def require_lock(
    db: Session,
    project_id: UUID,
    record_type: str,
    record_id: UUID,
    user: User,
) -> None:
    """Raise PermissionError if record is not locked by the current user."""
    existing = get_lock(db, project_id, record_type, record_id)
    if not existing:
        raise PermissionError("Record is not locked; acquire lock before editing")
    if existing.locked_by_user_id != user.id:
        raise PermissionError("Record is locked by another user")


def list_locks_for_project(db: Session, project_id: UUID) -> list[Lock]:
    """List all active (non-expired) locks in a project."""
    return (
        db.query(Lock)
        .filter(Lock.project_id == project_id, Lock.expires_at > _now())
        .all()
    )

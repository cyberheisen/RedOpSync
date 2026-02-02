"""Admin locks API - list and force release."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from app.core.admin_deps import require_admin
from app.db.session import get_db
from app.models.models import Lock, Project, User
from app.services.audit import log_audit

router = APIRouter()


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("")
def list_active_locks(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List all active (non-expired) locks grouped by project (admin only)."""
    now = datetime.now(timezone.utc)
    locks = (
        db.query(Lock)
        .options(
            joinedload(Lock.locked_by),
            joinedload(Lock.project),
        )
        .filter(Lock.expires_at > now)
        .order_by(Lock.project_id, Lock.locked_at)
        .all()
    )
    by_project: dict[str, dict] = {}
    for lock in locks:
        pid = str(lock.project_id)
        if pid not in by_project:
            by_project[pid] = {
                "project_id": pid,
                "project_name": lock.project.name if lock.project else "Unknown",
                "locks": [],
            }
        by_project[pid]["locks"].append({
            "id": str(lock.id),
            "record_type": lock.record_type,
            "record_id": str(lock.record_id),
            "locked_by_user_id": str(lock.locked_by_user_id),
            "locked_by_username": lock.locked_by.username if lock.locked_by else None,
            "locked_at": lock.locked_at.isoformat(),
            "expires_at": lock.expires_at.isoformat(),
        })
    return list(by_project.values())


@router.post("/{lock_id}/force-release", status_code=200)
def force_release_lock(
    lock_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Force release a single lock (admin only)."""
    lock = db.query(Lock).filter(Lock.id == lock_id).first()
    if not lock:
        raise HTTPException(status_code=404, detail="Lock not found")
    record_type = lock.record_type
    record_id = str(lock.record_id)
    project_id = lock.project_id
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="force_release_lock",
        record_type="lock",
        record_id=lock.id,
        before_json={"record_type": record_type, "record_id": record_id},
        ip_address=_get_client_ip(request),
    )
    db.delete(lock)
    db.commit()
    return {"ok": True}


@router.post("/project/{project_id}/force-release-all", status_code=200)
def force_release_all_locks(
    project_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Force release all locks for a project (admin only)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    locks = db.query(Lock).filter(Lock.project_id == project_id).all()
    count = len(locks)
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="force_release_all_locks",
        record_type="project",
        record_id=project_id,
        after_json={"project_name": project.name, "locks_released": count},
        ip_address=_get_client_ip(request),
    )
    for lock in locks:
        db.delete(lock)
    db.commit()
    return {"ok": True, "released": count}

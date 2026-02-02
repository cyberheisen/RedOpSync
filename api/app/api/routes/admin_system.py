"""Admin system maintenance and sessions API."""
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.db.session import get_db, engine
from app.models.models import Session as SessionModel, User
from app.services.audit import log_audit

router = APIRouter()

# Module-level start time for uptime
_start_time = datetime.now(timezone.utc)


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("/stats")
def get_system_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get system statistics (admin only)."""
    size_mb = 0.0
    try:
        with engine.connect() as conn:
            r = conn.execute(text("SELECT pg_database_size(current_database())"))
            size_bytes = r.scalar() or 0
            size_mb = round(size_bytes / (1024 * 1024), 2)
    except Exception:
        pass

    total_records = 0
    try:
        for table in ["users", "projects", "hosts", "ports", "subnets", "locks"]:
            r = db.execute(text(f"SELECT COUNT(*) FROM {table}"))
            total_records += r.scalar() or 0
    except Exception:
        pass

    uptime_seconds = (datetime.now(timezone.utc) - _start_time).total_seconds()
    days = int(uptime_seconds // 86400)
    hours = int((uptime_seconds % 86400) // 3600)
    minutes = int((uptime_seconds % 3600) // 60)
    uptime_str = f"{days}d {hours}h {minutes}m"

    return {
        "database_size_mb": size_mb,
        "total_records": total_records,
        "uptime": uptime_str,
        "api_requests_24h": 0,
    }


@router.get("/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List active sessions (admin only)."""
    sessions = db.query(SessionModel).order_by(SessionModel.last_activity.desc()).all()
    users_by_id = {}
    for s in sessions:
        if s.user_id not in users_by_id:
            u = db.query(User).filter(User.id == s.user_id).first()
            users_by_id[s.user_id] = u.username if u else "unknown"

    return [
        {
            "id": str(s.id),
            "user": users_by_id.get(s.user_id, "unknown"),
            "user_id": str(s.user_id),
            "ip": s.ip_address or "",
            "last_activity": s.last_activity.isoformat(),
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


@router.post("/sessions/{session_id}/terminate", status_code=200)
def terminate_session(
    session_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Terminate a session (admin only)."""
    sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot terminate your own session")
    log_audit(
        db,
        user_id=current_user.id,
        action_type="terminate_session",
        record_type="session",
        record_id=session_id,
        after_json={"target_user_id": str(sess.user_id)},
        ip_address=_get_client_ip(request),
    )
    db.delete(sess)
    db.commit()
    return {"ok": True}


@router.post("/force-logout-all", status_code=200)
def force_logout_all(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Force logout all users except current (admin only)."""
    deleted = db.query(SessionModel).filter(SessionModel.user_id != current_user.id).delete()
    log_audit(
        db,
        user_id=current_user.id,
        action_type="force_logout_all",
        record_type="system",
        record_id=None,
        after_json={"sessions_terminated": deleted},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return {"ok": True, "terminated": deleted}


@router.post("/cleanup-orphans", status_code=200)
def cleanup_orphans(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Cleanup orphaned records (admin only)."""
    removed = 0
    log_audit(
        db,
        user_id=current_user.id,
        action_type="cleanup_orphans",
        record_type="system",
        record_id=None,
        after_json={"removed": removed},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return {"ok": True, "removed": removed}


@router.post("/vacuum", status_code=200)
def vacuum_db(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Run database vacuum (admin only)."""
    db.commit()
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("VACUUM"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    log_audit(
        db,
        user_id=current_user.id,
        action_type="vacuum_db",
        record_type="system",
        record_id=None,
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return {"ok": True}

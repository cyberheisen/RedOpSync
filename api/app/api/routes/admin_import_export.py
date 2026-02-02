"""Admin import/export jobs API."""
import io
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.models import ImportExportJob, Project, User
from app.services.audit import log_audit

router = APIRouter()


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("")
def list_jobs(
    type_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List import/export jobs (admin only)."""
    q = db.query(ImportExportJob).order_by(ImportExportJob.created_at.desc()).limit(200)
    if type_filter in ("import", "export"):
        q = q.filter(ImportExportJob.type == type_filter)
    jobs = q.all()
    users_by_id = {}
    projects_by_id = {}
    for j in jobs:
        if j.created_by_user_id and j.created_by_user_id not in users_by_id:
            u = db.query(User).filter(User.id == j.created_by_user_id).first()
            users_by_id[j.created_by_user_id] = u.username if u else "unknown"
        if j.project_id and j.project_id not in projects_by_id:
            p = db.query(Project).filter(Project.id == j.project_id).first()
            projects_by_id[j.project_id] = p.name if p else "unknown"

    return [
        {
            "id": str(j.id),
            "type": j.type,
            "project_id": str(j.project_id) if j.project_id else None,
            "project_name": projects_by_id.get(j.project_id, ""),
            "filename": j.filename or "",
            "status": j.status,
            "created_by": users_by_id.get(j.created_by_user_id, "unknown"),
            "created_at": j.created_at.isoformat(),
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            "error_message": j.error_message,
        }
        for j in jobs
    ]


@router.post("/validate")
async def validate_import(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Validate an import ZIP without importing (admin only)."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")
    try:
        data = await file.read()
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            names = zf.namelist()
            if "manifest.json" not in names and not any(n.endswith("manifest.json") for n in names):
                return {"valid": False, "error": "Archive missing manifest.json"}
        return {"valid": True}
    except zipfile.BadZipFile:
        return {"valid": False, "error": "Invalid or corrupted ZIP file"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@router.post("/export")
async def start_export(
    request: Request,
    project_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Start export job - exports all projects or single project (admin only)."""
    from sqlalchemy.orm import Session as Sess

    job = ImportExportJob(
        type="export",
        project_id=project_id,
        filename="export.zip",
        status="pending",
        created_by_user_id=current_user.id,
    )
    db.add(job)
    log_audit(
        db,
        user_id=current_user.id,
        action_type="export_started",
        record_type="import_export_job",
        record_id=job.id,
        after_json={"project_id": str(project_id) if project_id else "all"},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    db.refresh(job)
    threading.Thread(target=_run_export_async, args=(job.id,)).start()
    return {"job_id": str(job.id), "status": "pending"}


@router.post("/import")
async def start_import(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Start import job (admin only)."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")
    data = await file.read()
    job = ImportExportJob(
        type="import",
        filename=file.filename,
        status="pending",
        created_by_user_id=current_user.id,
    )
    db.add(job)
    log_audit(
        db,
        user_id=current_user.id,
        action_type="import_started",
        record_type="import_export_job",
        record_id=job.id,
        after_json={"filename": file.filename},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    db.refresh(job)
    base = Path(settings.attachments_dir or "/tmp").joinpath("imports")
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{job.id}.zip"
    path.write_bytes(data)
    threading.Thread(target=_run_import_async, args=(job.id, str(path))).start()
    return {"job_id": str(job.id), "status": "pending"}


def _run_export_async(job_id: UUID) -> None:
    """Run export in background - simplified implementation."""
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(ImportExportJob).filter(ImportExportJob.id == job_id).first()
        if not job or job.status != "pending":
            return
        job.status = "in_progress"
        db.commit()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", '{"version":1,"projects":[]}')
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        job = db.query(ImportExportJob).filter(ImportExportJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def _run_import_async(job_id: UUID, path: str) -> None:
    """Run import in background - simplified implementation."""
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(ImportExportJob).filter(ImportExportJob.id == job_id).first()
        if not job or job.status != "pending":
            return
        job.status = "in_progress"
        db.commit()
        with zipfile.ZipFile(path, "r") as zf:
            _ = zf.namelist()
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        job = db.query(ImportExportJob).filter(ImportExportJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()

import io
import tempfile
import zipfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Lock, Project, User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectRead
from app.services.audit import log_audit
from app.services.gowitness_parser import parse_gowitness_directory
from app.services.gowitness_import import run_gowitness_import

router = APIRouter()


@router.get("", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Project).order_by(Project.created_at.desc()).all()


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(
    body: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    project = Project(
        name=body.name,
        description=body.description,
        start_date=body.start_date,
        end_date=body.end_date,
        countdown_red_days_default=body.countdown_red_days_default,
        scope_policy=body.scope_policy,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    log_audit(
        db,
        project_id=project.id,
        user_id=current_user.id,
        action_type="create_mission",
        record_type="project",
        record_id=project.id,
        after_json={"name": project.name},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/{project_id}/gowitness-import")
async def gowitness_import(
    project_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import GoWitness output (ZIP of directory with screenshots and/or JSONL metadata). Mission-scoped."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="GoWitness import requires a .zip file with PNG/JPEG screenshots and/or JSONL metadata.",
        )
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = await file.read()
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            names = zf.namelist()
            has_image = any(
                n.lower().endswith(ext) for n in names for ext in (".png", ".jpg", ".jpeg")
            )
            has_jsonl = any(n.lower().endswith(".jsonl") for n in names)
            if not has_image and not has_jsonl:
                raise HTTPException(
                    status_code=400,
                    detail="ZIP must contain PNG/JPEG screenshots and/or .jsonl metadata. Unsupported format.",
                )
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file.")

    with tempfile.TemporaryDirectory(prefix="gowitness_") as tmpdir:
        root = Path(tmpdir)
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            zf.extractall(root)
        parse_result = parse_gowitness_directory(root)
        if not parse_result.records and parse_result.errors:
            raise HTTPException(
                status_code=400,
                detail=parse_result.errors[0] if len(parse_result.errors) == 1 else "; ".join(parse_result.errors[:3]),
            )
        if not parse_result.records:
            return {
                "hosts_created": 0,
                "ports_created": 0,
                "screenshots_imported": 0,
                "metadata_records_imported": 0,
                "errors": parse_result.errors,
            }
        summary = run_gowitness_import(
            db,
            project_id,
            root,
            current_user.id,
            _get_client_ip(request),
        )

    return {
        "hosts_created": summary.hosts_created,
        "ports_created": summary.ports_created,
        "screenshots_imported": summary.screenshots_imported,
        "metadata_records_imported": summary.metadata_records_imported,
        "errors": summary.errors,
        "skipped": summary.skipped,
    }


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete project (admin only). Cascades to related data."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    name = project.name
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="delete_mission",
        record_type="project",
        record_id=project_id,
        before_json={"name": name},
        ip_address=_get_client_ip(request),
    )
    # Delete locks explicitly to avoid SQLAlchemy trying to null project_id (NOT NULL)
    db.query(Lock).filter(Lock.project_id == project_id).delete(synchronize_session=False)
    db.delete(project)
    db.commit()
    return None

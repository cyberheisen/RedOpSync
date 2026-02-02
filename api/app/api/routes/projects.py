from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Lock, Project, User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectRead
from app.schemas.report import ReportRunRequest, ReportRunResponse, ReportConfigSchema, ReportFiltersSchema, ReportBuilderRequest
from app.services.audit import log_audit
from app.services.import_dispatcher import run_import
from app.services.reports import run_report, list_report_configs, run_builder, BUILDER_COLUMNS, _builder_columns_json, ReportFilters

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


@router.post("/{project_id}/import")
async def import_scan(
    project_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified import: auto-detects format and runs the appropriate importer.

    Supports:
    - Nmap XML (.xml or .zip containing .xml)
    - GoWitness (.zip with PNG/JPEG and/or JSONL)
    - Plain text (.txt) - one host per line: IP [hostname]
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    fn = file.filename.lower()
    if not (fn.endswith(".xml") or fn.endswith(".zip") or fn.endswith(".txt")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use Nmap XML (.xml), GoWitness/ZIP (.zip), or plain text (.txt).",
        )
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        result = run_import(
            db,
            project_id,
            data,
            file.filename or "upload",
            current_user.id,
            _get_client_ip(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.get("/{project_id}/reports/builder/columns")
def get_builder_columns(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get available columns per data source for report builder."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _builder_columns_json()


@router.post("/{project_id}/reports/builder", response_model=ReportRunResponse)
def run_report_builder(
    project_id: UUID,
    body: ReportBuilderRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run report builder: select columns + filter expression."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        rows = run_builder(db, project_id, body.data_source, body.columns, body.filter_expression)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="report_builder_generated",
        record_type="project",
        record_id=project_id,
        after_json={
            "data_source": body.data_source,
            "columns": body.columns,
            "filter_expression": body.filter_expression,
            "row_count": len(rows),
        },
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return ReportRunResponse(
        report_type="builder",
        report_name="Report builder",
        rows=rows,
        count=len(rows),
    )


@router.get("/{project_id}/reports/configs", response_model=list[ReportConfigSchema])
def list_reports(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List available custom report types."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return [ReportConfigSchema(id=c.id, name=c.name) for c in list_report_configs()]


@router.post("/{project_id}/reports/run", response_model=ReportRunResponse)
def run_custom_report(
    project_id: UUID,
    body: ReportRunRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run a custom report and return rows."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    f = body.filters
    filters = ReportFilters(
        exclude_unresolved=f.exclude_unresolved if f else True,
        status=f.status if f else None,
        subnet_id=f.subnet_id if f else None,
        port_number=f.port_number if f else None,
        port_protocol=f.port_protocol if f else None,
        severity=f.severity if f else None,
    )
    try:
        rows, config = run_report(db, project_id, body.report_type, filters)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="custom_report_generated",
        record_type="project",
        record_id=project_id,
        after_json={
            "report_type": body.report_type,
            "report_name": config.name,
            "filters": {
                "exclude_unresolved": filters.exclude_unresolved,
                "status": filters.status,
                "subnet_id": str(filters.subnet_id) if filters.subnet_id else None,
                "port_number": filters.port_number,
                "port_protocol": filters.port_protocol,
                "severity": filters.severity,
            },
            "row_count": len(rows),
        },
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return ReportRunResponse(
        report_type=config.id,
        report_name=config.name,
        rows=rows,
        count=len(rows),
    )


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

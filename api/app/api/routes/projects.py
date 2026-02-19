from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import AuditEvent, ItemTag, Lock, Project, SavedReport, Tag, User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectRead, ProjectSortModeUpdate
from app.schemas.tag import TagCreate, TagRead, ItemTagCreate, ItemTagRead
from app.schemas.report import (
    ReportRunRequest,
    ReportRunResponse,
    ReportConfigSchema,
    ReportFiltersSchema,
    ReportBuilderRequest,
    SavedReportCreate,
    SavedReportRead,
    SavedReportQueryDefinition,
)
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


TOOL_RUN_ACTIONS = {
    "nmap_import_started",
    "nmap_import_completed",
    "gowitness_import_started",
    "gowitness_import_completed",
    "text_import_started",
    "text_import_completed",
    "masscan_import_started",
    "masscan_import_completed",
}


def _action_to_tool(action_type: str) -> str:
    if "nmap" in action_type:
        return "nmap"
    if "gowitness" in action_type:
        return "gowitness"
    if "text" in action_type:
        return "text"
    if "masscan" in action_type:
        return "masscan"
    return "unknown"


@router.get("/{project_id}/tool-runs")
def list_tool_runs(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List import/tool run events for the project (nmap, gowitness, text)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    q = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.project_id == project_id,
            AuditEvent.action_type.in_(TOOL_RUN_ACTIONS),
        )
        .order_by(AuditEvent.created_at.desc())
    )
    rows = q.all()
    return {
        "events": [
            {
                "id": str(r.id),
                "timestamp": r.created_at.isoformat(),
                "action_type": r.action_type,
                "tool": _action_to_tool(r.action_type),
                "details": r.after_json or {},
            }
            for r in rows
        ],
    }


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


@router.patch("/{project_id}/sort-mode", response_model=ProjectRead)
def update_project_sort_mode(
    project_id: UUID,
    body: ProjectSortModeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project sort_mode (any user with project access)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.sort_mode = body.sort_mode
    db.commit()
    db.refresh(project)
    return project


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


ALLOWED_IMPORT_EXTENSIONS = (".xml", ".zip", ".txt", ".json", ".masscan", ".lst")


def _aggregate_import_results(results: list[dict], formats: list[str]) -> dict:
    """Sum numeric fields and concatenate errors; set format to first or 'mixed'."""
    if not results:
        return {
            "format": "unknown",
            "hosts_created": 0,
            "hosts_updated": 0,
            "subnets_updated": 0,
            "ports_created": 0,
            "ports_updated": 0,
            "evidence_created": 0,
            "notes_created": 0,
            "screenshots_imported": 0,
            "metadata_records_imported": 0,
            "skipped": 0,
            "errors": [],
            "files_processed": 0,
        }
    numeric_keys = (
        "hosts_created",
        "hosts_updated",
        "subnets_updated",
        "ports_created",
        "ports_updated",
        "evidence_created",
        "notes_created",
        "screenshots_imported",
        "metadata_records_imported",
        "skipped",
    )
    agg = {k: 0 for k in numeric_keys}
    agg["errors"] = []
    for r in results:
        for k in numeric_keys:
            agg[k] += r.get(k) or 0
        for e in r.get("errors") or []:
            agg["errors"].append(e)
    agg["format"] = formats[0] if len(set(formats)) == 1 else "mixed"
    agg["files_processed"] = len(results)
    return agg


@router.post("/{project_id}/import")
async def import_scan(
    project_id: UUID,
    request: Request,
    file: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified import: auto-detects format and runs the appropriate importer.
    Accepts one or more files; each is processed and results are aggregated.

    Supports:
    - Nmap XML (.xml or .zip containing .xml)
    - GoWitness (.zip with PNG/JPEG and/or JSONL)
    - Plain text (.txt) - one host per line: IP [hostname]
    - Masscan list (.masscan, .lst, or .txt)
    - Whois/RDAP JSON (.json)
    """
    files = [f for f in file if f.filename and (f.filename or "").strip()]
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    request_ip = _get_client_ip(request)
    results: list[dict] = []
    formats_used: list[str] = []

    for upload in files:
        fn = (upload.filename or "").strip().lower()
        if not any(fn.endswith(ext) for ext in ALLOWED_IMPORT_EXTENSIONS):
            results.append({
                "format": "unknown",
                "hosts_created": 0,
                "hosts_updated": 0,
                "ports_created": 0,
                "ports_updated": 0,
                "errors": [f"{upload.filename}: Unsupported file type. Use Nmap XML (.xml), GoWitness/ZIP (.zip), plain text (.txt), Masscan list (.masscan, .lst, or .txt), or whois/RDAP JSON (.json)."],
            })
            formats_used.append("unknown")
            continue
        try:
            data = await upload.read()
        except Exception as e:
            results.append({
                "format": "unknown",
                "hosts_created": 0,
                "hosts_updated": 0,
                "ports_created": 0,
                "ports_updated": 0,
                "errors": [f"{upload.filename}: Failed to read file — {e}"],
            })
            formats_used.append("unknown")
            continue
        if len(data) == 0:
            results.append({
                "format": "unknown",
                "hosts_created": 0,
                "hosts_updated": 0,
                "ports_created": 0,
                "ports_updated": 0,
                "errors": [f"{upload.filename}: Empty file"],
            })
            formats_used.append("unknown")
            continue
        try:
            result = run_import(
                db,
                project_id,
                data,
                upload.filename or "upload",
                current_user.id,
                request_ip,
            )
            # Prefix errors with filename so user can see which file had which error
            errors = result.get("errors") or []
            result["errors"] = [f"{upload.filename}: {e}" if e else f"{upload.filename}" for e in errors]
            results.append(result)
            formats_used.append((result.get("format") or "unknown"))
        except ValueError as e:
            results.append({
                "format": "unknown",
                "hosts_created": 0,
                "hosts_updated": 0,
                "ports_created": 0,
                "ports_updated": 0,
                "errors": [f"{upload.filename}: {e}"],
            })
            formats_used.append("unknown")

    return _aggregate_import_results(results, formats_used)


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


@router.get("/{project_id}/reports/saved", response_model=list[SavedReportRead])
def list_saved_reports(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List saved report definitions for the project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    reports = db.query(SavedReport).filter(SavedReport.project_id == project_id).order_by(SavedReport.created_at.desc()).all()
    return [
        SavedReportRead(
            id=r.id,
            project_id=r.project_id,
            name=r.name,
            description=r.description,
            query_definition=SavedReportQueryDefinition(
                data_source=r.data_source,
                columns=r.columns or [],
                filter_expression=r.filter_expression or "",
            ),
            created_at=r.created_at,
        )
        for r in reports
    ]


@router.post("/{project_id}/reports/saved", response_model=SavedReportRead, status_code=201)
def create_saved_report(
    project_id: UUID,
    body: SavedReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a report definition."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    q = body.query_definition
    if q.data_source not in ("hosts", "ports", "evidence", "vulns"):
        raise HTTPException(status_code=400, detail="Invalid data_source")
    sr = SavedReport(
        project_id=project_id,
        name=body.name,
        description=body.description,
        data_source=q.data_source,
        columns=q.columns,
        filter_expression=q.filter_expression or None,
    )
    db.add(sr)
    db.commit()
    db.refresh(sr)
    return SavedReportRead(
        id=sr.id,
        project_id=sr.project_id,
        name=sr.name,
        description=sr.description,
        query_definition=SavedReportQueryDefinition(
            data_source=sr.data_source,
            columns=sr.columns or [],
            filter_expression=sr.filter_expression or "",
        ),
        created_at=sr.created_at,
    )


@router.post("/{project_id}/reports/saved/{report_id}/run", response_model=ReportRunResponse)
def run_saved_report(
    project_id: UUID,
    report_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run a saved report and return tabular data (results not stored)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sr = db.query(SavedReport).filter(SavedReport.id == report_id, SavedReport.project_id == project_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Saved report not found")
    try:
        rows = run_builder(db, project_id, sr.data_source, sr.columns or [], sr.filter_expression or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="saved_report_run",
        record_type="saved_report",
        record_id=report_id,
        after_json={"name": sr.name, "row_count": len(rows)},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return ReportRunResponse(
        report_type="saved",
        report_name=sr.name,
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


# ---- Tags (mission-based) ----
@router.get("/{project_id}/tags", response_model=list[TagRead])
def list_tags(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List tags for the project (mission). All users in the mission see the same tags."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    tags = db.query(Tag).filter(Tag.project_id == project_id).order_by(Tag.name).all()
    return [TagRead.model_validate(t) for t in tags]


@router.post("/{project_id}/tags", response_model=TagRead, status_code=201)
def create_tag(
    project_id: UUID,
    body: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a tag for the project (mission)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    tag = Tag(project_id=project_id, name=body.name, color=body.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagRead.model_validate(tag)


@router.delete("/{project_id}/tags/{tag_id}", status_code=204)
def delete_tag(
    project_id: UUID,
    tag_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a tag from the project (mission). Cascades to item_tags."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.project_id == project_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return None


@router.get("/{project_id}/item-tags", response_model=list[ItemTagRead])
def list_item_tags(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List item-tag assignments for the project. Used to show tag child nodes in the tree."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    q = (
        db.query(ItemTag)
        .join(Tag)
        .filter(Tag.project_id == project_id)
    )
    item_tags = q.all()
    return [
        ItemTagRead(
            id=it.id,
            tag_id=it.tag_id,
            target_type=it.target_type,
            target_id=it.target_id,
            tag_name=it.tag.name,
            tag_color=it.tag.color,
        )
        for it in item_tags
    ]


@router.post("/{project_id}/item-tags", response_model=ItemTagRead, status_code=201)
def add_item_tag(
    project_id: UUID,
    body: ItemTagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a tag to a host, port, port_evidence, or vuln_definition."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    tag = db.query(Tag).filter(Tag.id == body.tag_id, Tag.project_id == project_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    existing = (
        db.query(ItemTag)
        .filter(
            ItemTag.tag_id == body.tag_id,
            ItemTag.target_type == body.target_type,
            ItemTag.target_id == body.target_id,
        )
    ).first()
    if existing:
        return ItemTagRead(
            id=existing.id,
            tag_id=existing.tag_id,
            target_type=existing.target_type,
            target_id=existing.target_id,
            tag_name=tag.name,
            tag_color=tag.color,
        )
    item_tag = ItemTag(tag_id=body.tag_id, target_type=body.target_type, target_id=body.target_id)
    db.add(item_tag)
    db.commit()
    db.refresh(item_tag)
    return ItemTagRead(
        id=item_tag.id,
        tag_id=item_tag.tag_id,
        target_type=item_tag.target_type,
        target_id=item_tag.target_id,
        tag_name=tag.name,
        tag_color=tag.color,
    )


@router.delete("/{project_id}/item-tags/{item_tag_id}", status_code=204)
def remove_item_tag(
    project_id: UUID,
    item_tag_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a tag from an item (called when right-clicking the tag node)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    item_tag = db.query(ItemTag).join(Tag).filter(ItemTag.id == item_tag_id, Tag.project_id == project_id).first()
    if not item_tag:
        raise HTTPException(status_code=404, detail="Item tag not found")
    db.delete(item_tag)
    db.commit()
    return None


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

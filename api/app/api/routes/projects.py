import csv
import io
import logging
import os
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import AuditEvent, ItemTag, Lock, Project, SavedReport, Tag, User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectRead, ProjectSortModeUpdate, ImportFromPathBody
from app.schemas.tag import TagCreate, TagRead, ItemTagCreate, ItemTagRead
from app.schemas.report import (
    ReportRunRequest,
    ReportRunResponse,
    ReportConfigSchema,
    ReportFiltersSchema,
    ReportBuilderRequest,
    SavedReportCreate,
    SavedReportCreateV2,
    SavedReportRead,
    SavedReportUpdate,
    SavedReportQueryDefinition,
    ReportDefinition,
    ExecuteReportRequest,
    ExecuteReportResponse,
)
from app.services.audit import log_audit
from app.services.report_builder_service import (
    execute_report,
    SERVICE_CURRENT_COLUMNS,
    SELECT_COLUMN_EXPRESSIONS,
)
from app.db.session import SessionLocal
from app.services.import_dispatcher import run_import, run_gowitness_import_from_path
from app.services.import_job_store import create_job, get_job, set_failed, set_progress, set_result
from app.services.reports import run_report, list_report_configs, run_builder, BUILDER_COLUMNS, _builder_columns_json, ReportFilters

logger = logging.getLogger(__name__)
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


def _resolve_import_path(path_str: str) -> tuple[Path, Path]:
    """Resolve base and full path; full must be under base. Returns (base, full). Raises HTTPException on violation."""
    base = Path(settings.import_from_path_dir).resolve()
    base.mkdir(parents=True, exist_ok=True)
    path_str = (path_str or "").strip().lstrip("/")
    full = (base / path_str).resolve() if path_str else base
    try:
        if path_str and os.path.commonpath([base, full]) != str(base):
            raise HTTPException(status_code=400, detail="Path must be under the import directory.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Path must be under the import directory.")
    return base, full


@router.get("/{project_id}/import-from-path/files")
def list_import_from_path_files(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List files and directories in the server's import directory (IMPORT_FROM_PATH_DIR). Paths are relative for use with POST import-from-path."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    base = Path(settings.import_from_path_dir).resolve()
    base.mkdir(parents=True, exist_ok=True)
    if not base.is_dir():
        return {"files": []}
    files: list[dict] = []
    try:
        for entry in sorted(base.iterdir()):
            try:
                rel = entry.relative_to(base)
                path_str = str(rel).replace("\\", "/")
            except ValueError:
                continue
            if entry.is_dir():
                files.append({"name": entry.name, "path": path_str, "is_dir": True})
            elif entry.is_file() and any(entry.name.lower().endswith(ext) for ext in ALLOWED_IMPORT_EXTENSIONS):
                files.append({"name": entry.name, "path": path_str, "is_dir": False})
    except OSError as e:
        logger.warning("List import dir failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not list import directory")
    return {"files": files}


def _run_import_job(
    job_id: str,
    project_id: UUID,
    file_path: str,
    filename: str,
    user_id: UUID,
    request_ip: str | None,
) -> None:
    """Background thread: run import from file on disk. For .zip avoids loading entire archive into memory."""
    logger.info("Import job started job_id=%s project_id=%s filename=%s", job_id, project_id, filename)
    db = SessionLocal()
    try:
        path = Path(file_path)
        if not path.exists():
            set_failed(job_id, f"File or directory not found: {file_path}")
            return

        def progress_cb(current: int, total: int) -> None:
            set_progress(job_id, current, total)

        if path.is_dir():
            result = run_gowitness_import_from_path(
                db, project_id, path, user_id, request_ip, progress_callback=progress_cb
            )
            set_result(job_id, result)
            logger.info(
                "Import job completed job_id=%s format=gowitness hosts_created=%s screenshots_imported=%s",
                job_id, result.get("hosts_created", 0), result.get("screenshots_imported", 0),
            )
            return

        if not path.is_file():
            set_failed(job_id, f"Not a file: {file_path}")
            return

        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path, "r") as zf:
                names = zf.namelist()
            has_image = any(
                n.lower().endswith(ext) for n in names for ext in (".png", ".jpg", ".jpeg")
            )
            has_jsonl = any(n.lower().endswith(".jsonl") for n in names)
            has_xml = any(
                n.lower().endswith(".xml") and not n.startswith("__") for n in names
            )
            if has_image or has_jsonl:
                result = run_gowitness_import_from_path(
                    db, project_id, path, user_id, request_ip, progress_callback=progress_cb
                )
            elif has_xml:
                with zipfile.ZipFile(path, "r") as zf:
                    for n in zf.namelist():
                        if n.lower().endswith(".xml") and not n.startswith("__"):
                            xml_content = zf.read(n)
                            result = run_import(
                                db,
                                project_id,
                                xml_content,
                                n,
                                user_id,
                                request_ip,
                                progress_callback=progress_cb,
                            )
                            break
                    else:
                        set_failed(job_id, "ZIP contains no recognized Nmap XML file.")
                        return
            else:
                content = path.read_bytes()
                result = run_import(
                    db,
                    project_id,
                    content,
                    filename,
                    user_id,
                    request_ip,
                    progress_callback=progress_cb,
                )
        else:
            content = path.read_bytes()
            result = run_import(
                db,
                project_id,
                content,
                filename,
                user_id,
                request_ip,
                progress_callback=progress_cb,
            )
        set_result(job_id, result)
        logger.info(
            "Import job completed job_id=%s format=%s hosts_created=%s ports_created=%s screenshots_imported=%s",
            job_id,
            result.get("format"),
            result.get("hosts_created", 0),
            result.get("ports_created", 0),
            result.get("screenshots_imported", 0),
        )
    except Exception as e:
        logger.exception("Import job failed job_id=%s: %s", job_id, e)
        set_failed(job_id, str(e))
    finally:
        db.close()


@router.post("/{project_id}/import-from-path/upload")
async def import_from_path_upload(
    project_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a file to the server's import directory then run import in the background.
    Returns 202 with job_id; poll GET /import-jobs/{job_id} for status and progress.
    Same supported formats as regular import. Use for large files to avoid timeouts.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not file.filename or not (file.filename or "").strip():
        raise HTTPException(status_code=400, detail="No file provided")
    fn = (file.filename or "upload").strip()
    if not any(fn.lower().endswith(ext) for ext in ALLOWED_IMPORT_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use .xml, .zip, .txt, .json, .masscan, or .lst",
        )
    base = Path(settings.import_from_path_dir).resolve()
    base.mkdir(parents=True, exist_ok=True)
    safe_name = os.path.basename(fn)
    if not safe_name or safe_name.startswith(".") or ".." in safe_name or "/" in safe_name or "\\" in safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    dest = base / safe_name
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    try:
        dest.write_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file on server: {e}")

    job_id = create_job(project_id)
    request_ip = _get_client_ip(request)
    # Pass file path so the thread reads from disk; avoids holding full upload in request + thread (OOM on small systems).
    thread = threading.Thread(
        target=_run_import_job,
        args=(job_id, project_id, str(dest), safe_name, current_user.id, request_ip),
    )
    thread.start()
    logger.info("Import upload accepted job_id=%s project_id=%s filename=%s returning 202", job_id, project_id, safe_name)
    return JSONResponse(
        status_code=202,
        content={"job_id": job_id},
    )


@router.get("/{project_id}/import-jobs/{job_id}")
def get_import_job(
    project_id: UUID,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get status and progress of an async import job. Poll until status is completed or failed."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    job = get_job(job_id, project_id)
    if not job:
        logger.info("Import job poll 404 job_id=%s project_id=%s", job_id, project_id)
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{project_id}/import-from-path/start")
def import_from_path_start(
    project_id: UUID,
    request: Request,
    body: ImportFromPathBody = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Start import from a file or directory on the server (path relative to IMPORT_FROM_PATH_DIR).
    Returns 202 with job_id; poll GET /import-jobs/{job_id} for status. Use for large files to avoid timeouts.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    path_str = (body.path or "").strip()
    if not path_str:
        raise HTTPException(status_code=400, detail="Path is required")
    _base, full = _resolve_import_path(path_str)
    if not full.exists():
        raise HTTPException(status_code=404, detail="File or directory not found")
    if full.is_file() and not any(full.name.lower().endswith(ext) for ext in ALLOWED_IMPORT_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use .xml, .zip, .txt, .json, .masscan, or .lst",
        )
    job_id = create_job(project_id)
    request_ip = _get_client_ip(request)
    thread = threading.Thread(
        target=_run_import_job,
        args=(job_id, project_id, str(full), full.name, current_user.id, request_ip),
    )
    thread.start()
    logger.info("Import from path started job_id=%s project_id=%s path=%s returning 202", job_id, project_id, path_str)
    return JSONResponse(status_code=202, content={"job_id": job_id})


@router.post("/{project_id}/import-from-path")
def import_from_path(
    project_id: UUID,
    request: Request,
    body: ImportFromPathBody = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Import from a file or directory on the server (synchronous). Path is relative to the import directory.
    For large files prefer POST /import-from-path/start (returns 202, poll import-jobs).
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    path_str = (body.path or "").strip()
    if not path_str:
        raise HTTPException(status_code=400, detail="Path is required")

    _base, full = _resolve_import_path(path_str)
    if not full.exists():
        raise HTTPException(status_code=404, detail="File or directory not found")

    request_ip = _get_client_ip(request)

    if full.is_file():
        if not any(full.name.lower().endswith(ext) for ext in ALLOWED_IMPORT_EXTENSIONS):
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Use .xml, .zip, .txt, .json, .masscan, or .lst",
            )
        try:
            content = full.read_bytes()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        try:
            result = run_import(db, project_id, content, full.name, current_user.id, request_ip)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return result

    if full.is_dir():
        try:
            return run_gowitness_import_from_path(
                db, project_id, full, current_user.id, request_ip
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    raise HTTPException(status_code=400, detail="Path must be a file or a directory.")


def _saved_report_to_read(sr: SavedReport) -> SavedReportRead:
    definition = None
    if getattr(sr, "definition_json", None):
        try:
            definition = ReportDefinition.model_validate(sr.definition_json)
        except Exception:
            pass
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
        definition=definition,
        created_at=sr.created_at,
        updated_at=getattr(sr, "updated_at", None),
        created_by_user_id=getattr(sr, "created_by_user_id", None),
    )


# Service-current column labels for Report Builder (service_current view)
SERVICE_CURRENT_COLUMN_LABELS = {
    "host_ip": "Host IP",
    "host_fqdn": "Host FQDN",
    "host_tags": "Host tags",
    "service_id": "Service ID",
    "proto": "Protocol",
    "port": "Port",
    "state": "State",
    "last_seen": "Last seen",
    "service_name": "Service name",
    "service_version": "Service version",
    "banner": "Banner",
    "scan_metadata": "Scan metadata",
    "whois_data": "Whois data",
    "latest_evidence_caption": "Latest evidence caption",
    "screenshot_path": "Screenshot path",
    "latest_http_title": "HTTP title",
    "latest_http_server": "HTTP server",
    "latest_http_status_code": "HTTP status",
    "latest_gowitness_tech": "GoWitness tech",
    "has_http": "Has HTTP",
    "whois_asn": "ASN",
    "whois_org": "Org",
    "whois_cidr": "CIDR",
    "whois_country": "Country",
}


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


@router.get("/{project_id}/reports/service-current/columns")
def get_service_current_columns(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get available columns for Report Builder (service_current view)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "service_current": [
            [cid, SERVICE_CURRENT_COLUMN_LABELS.get(cid, cid)]
            for cid in sorted(SELECT_COLUMN_EXPRESSIONS.keys())
        ],
    }


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


@router.post("/{project_id}/reports/execute", response_model=ExecuteReportResponse)
def execute_report_definition(
    project_id: UUID,
    body: ExecuteReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute ad-hoc report definition (no save). Mission-scoped."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        columns, rows, total_count = execute_report(db, project_id, body.definition)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ExecuteReportResponse(columns=columns, rows=rows, total_count=total_count)


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
    return [_saved_report_to_read(r) for r in reports]


@router.post("/{project_id}/reports/saved", response_model=SavedReportRead, status_code=201)
def create_saved_report(
    project_id: UUID,
    body: SavedReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a report definition (legacy: query_definition)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    q = body.query_definition
    if q.data_source not in ("hosts", "ports", "evidence", "vulns", "service_current"):
        raise HTTPException(status_code=400, detail="Invalid data_source")
    sr = SavedReport(
        project_id=project_id,
        name=body.name,
        description=body.description,
        data_source=q.data_source,
        columns=q.columns,
        filter_expression=q.filter_expression or None,
        created_by_user_id=current_user.id,
    )
    db.add(sr)
    db.commit()
    db.refresh(sr)
    return _saved_report_to_read(sr)


@router.post("/{project_id}/reports/saved/v2", response_model=SavedReportRead, status_code=201)
def create_saved_report_v2(
    project_id: UUID,
    body: SavedReportCreateV2,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a report definition (Report Builder: definition_json)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    defn = body.definition
    sr = SavedReport(
        project_id=project_id,
        name=body.name,
        description=body.description,
        data_source="service_current",
        columns=defn.columns or [],
        filter_expression=None,
        definition_json=defn.model_dump(mode="json"),
        created_by_user_id=current_user.id,
    )
    db.add(sr)
    db.commit()
    db.refresh(sr)
    return _saved_report_to_read(sr)


@router.put("/{project_id}/reports/saved/{report_id}", response_model=SavedReportRead)
def update_saved_report(
    project_id: UUID,
    report_id: UUID,
    body: SavedReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a saved report (name, description, definition)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sr = db.query(SavedReport).filter(SavedReport.id == report_id, SavedReport.project_id == project_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Saved report not found")
    if body.name is not None:
        sr.name = body.name
    if body.description is not None:
        sr.description = body.description
    if body.definition is not None:
        sr.definition_json = body.definition.model_dump(mode="json")
        sr.data_source = "service_current"
        sr.columns = body.definition.columns or []
        sr.filter_expression = None
    sr.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sr)
    return _saved_report_to_read(sr)


@router.delete("/{project_id}/reports/saved/{report_id}", status_code=204)
def delete_saved_report(
    project_id: UUID,
    report_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a saved report."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sr = db.query(SavedReport).filter(SavedReport.id == report_id, SavedReport.project_id == project_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Saved report not found")
    db.delete(sr)
    db.commit()
    return None


@router.get("/{project_id}/reports/saved/{report_id}/export")
def export_saved_report(
    project_id: UUID,
    report_id: UUID,
    format: str = "csv",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run saved report and export as CSV or JSON. format=csv|json."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sr = db.query(SavedReport).filter(SavedReport.id == report_id, SavedReport.project_id == project_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Saved report not found")
    if sr.definition_json:
        try:
            definition = ReportDefinition.model_validate(sr.definition_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid saved definition")
        columns, rows, _ = execute_report(db, project_id, definition)
    else:
        try:
            rows = run_builder(db, project_id, sr.data_source, sr.columns or [], sr.filter_expression or "")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        columns = list(rows[0].keys()) if rows else []
    format_lower = (format or "csv").strip().lower()
    if format_lower == "json":
        buf = io.BytesIO()
        import json
        buf.write(json.dumps({"columns": columns, "rows": rows}, default=str).encode("utf-8"))
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{sr.name.replace(" ", "-")}.json"'},
        )
    if format_lower == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)
        for r in rows:
            writer.writerow([r.get(c) for c in columns])
        out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))
        out.seek(0)
        return StreamingResponse(
            out,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{sr.name.replace(" ", "-")}.csv"'},
        )
    raise HTTPException(status_code=400, detail="format must be csv or json")


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
    if sr.definition_json:
        try:
            definition = ReportDefinition.model_validate(sr.definition_json)
            columns, rows, total_count = execute_report(db, project_id, definition)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return ReportRunResponse(
            report_type="saved",
            report_name=sr.name,
            rows=rows,
            count=total_count,
        )
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

"""Mission export: serialize project(s) and related data to a structure suitable for ZIP export."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import (
    Application,
    Evidence,
    Host,
    ItemTag,
    Note,
    Port,
    Project,
    SavedReport,
    Subnet,
    Tag,
    Todo,
    VulnerabilityAttachment,
    VulnerabilityDefinition,
    VulnerabilityInstance,
)


def _serialize_value(v):
    if v is None:
        return None
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat() if v.tzinfo else v.replace(tzinfo=timezone.utc).isoformat()
    if isinstance(v, (list, tuple)) and v and isinstance(v[0], str):
        return list(v)
    if isinstance(v, list):
        return [_serialize_value(x) for x in v]
    if isinstance(v, dict):
        return {k: _serialize_value(x) for k, x in v.items()}
    return v


def _row_to_dict(row, exclude=None):
    exclude = set(exclude or [])
    d = {}
    for c in row.__table__.columns:
        if c.name in exclude:
            continue
        v = getattr(row, c.name)
        d[c.name] = _serialize_value(v)
    return d


def _export_project(db: Session, project_id: UUID):
    """Load one project and all related data; return (payload_dict, attachment_list).
    attachment_list: [(zip_path, local_path), ...]
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None, []

    subnets = db.query(Subnet).filter(Subnet.project_id == project_id).order_by(Subnet.created_at).all()
    subnet_ids = [s.id for s in subnets]
    hosts = (
        db.query(Host)
        .filter(Host.project_id == project_id)
        .order_by(Host.created_at)
        .all()
    )
    host_ids = [h.id for h in hosts]
    ports = (
        db.query(Port)
        .filter(Port.host_id.in_(host_ids))
        .order_by(Port.host_id, Port.protocol, Port.number)
        .all()
    )
    port_ids = [p.id for p in ports]
    applications = db.query(Application).filter(Application.host_id.in_(host_ids)).all()
    vuln_defs = (
        db.query(VulnerabilityDefinition)
        .filter(VulnerabilityDefinition.project_id == project_id)
        .order_by(VulnerabilityDefinition.created_at)
        .all()
    )
    vuln_def_ids = [v.id for v in vuln_defs]
    vuln_instances = (
        db.query(VulnerabilityInstance)
        .filter(VulnerabilityInstance.project_id == project_id)
        .all()
    )
    evidence = db.query(Evidence).filter(Evidence.project_id == project_id).all()
    notes = db.query(Note).filter(Note.project_id == project_id).all()
    todos = db.query(Todo).filter(Todo.project_id == project_id).all()
    saved_reports = db.query(SavedReport).filter(SavedReport.project_id == project_id).all()
    tags = db.query(Tag).filter(Tag.project_id == project_id).all()
    tag_ids = [t.id for t in tags]
    item_tags = db.query(ItemTag).filter(ItemTag.tag_id.in_(tag_ids)).all() if tag_ids else []

    vuln_attachments = (
        db.query(VulnerabilityAttachment)
        .filter(VulnerabilityAttachment.vulnerability_definition_id.in_(vuln_def_ids))
        .all()
    )

    payload = {
        "project": _row_to_dict(project),
        "subnets": [_row_to_dict(s) for s in subnets],
        "hosts": [_row_to_dict(h) for h in hosts],
        "ports": [_row_to_dict(p) for p in ports],
        "applications": [_row_to_dict(a) for a in applications],
        "vulnerability_definitions": [_row_to_dict(v) for v in vuln_defs],
        "vulnerability_instances": [_row_to_dict(vi) for vi in vuln_instances],
        "evidence": [_row_to_dict(e) for e in evidence],
        "notes": [_row_to_dict(n) for n in notes],
        "todos": [_row_to_dict(t) for t in todos],
        "saved_reports": [_row_to_dict(sr) for sr in saved_reports],
        "tags": [_row_to_dict(t) for t in tags],
        "item_tags": [_row_to_dict(it) for it in item_tags],
        "vulnerability_attachments": [_row_to_dict(va) for va in vuln_attachments],
    }

    attachments = []
    for e in evidence:
        if e.stored_path and os.path.isfile(e.stored_path):
            zip_path = f"attachments/evidence/{e.id}/{e.filename}"
            attachments.append((zip_path, e.stored_path))
        if e.thumbnail_path and os.path.isfile(e.thumbnail_path):
            zip_path_thumb = f"attachments/evidence/{e.id}/thumbnail_{Path(e.thumbnail_path).name}"
            attachments.append((zip_path_thumb, e.thumbnail_path))
    for va in vuln_attachments:
        if va.stored_path and os.path.isfile(va.stored_path):
            zip_path = f"attachments/vuln_def/{va.vulnerability_definition_id}/{va.filename}"
            attachments.append((zip_path, va.stored_path))

    return payload, attachments


def build_export_zip(db: Session, project_ids: list[UUID], zip_path: str) -> str | None:
    """Build ZIP at zip_path for given project_ids. Returns suggested download filename or None on failure."""
    import zipfile

    manifest_projects = []
    all_attachments = []

    for pid in project_ids:
        project = db.query(Project).filter(Project.id == pid).first()
        if not project:
            continue
        payload, atts = _export_project(db, pid)
        if payload is None:
            continue
        manifest_projects.append({"id": str(pid), "name": project.name})
        all_attachments.append((f"projects/{pid}.json", None, json.dumps(payload, indent=2)))
        for zip_rel, local_path in atts:
            all_attachments.append((zip_rel, local_path, None))

    if not manifest_projects:
        return None

    manifest = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "projects": manifest_projects,
    }

    # Build ZIP: write to a temp path then move, or write to zip_path directly
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            for entry in all_attachments:
                zip_name, local_path, data = entry
                if data is not None:
                    zf.writestr(zip_name, data)
                else:
                    zf.write(local_path, zip_name)
        Path(zip_path).parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp_path, zip_path)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        raise

    if len(manifest_projects) == 1:
        name_safe = "".join(c if c.isalnum() or c in " -_" else "-" for c in manifest_projects[0]["name"])
        return f"mission-{name_safe.strip() or 'export'}.zip"
    return f"missions-export-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.zip"

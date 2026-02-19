"""Mission import: load project(s) from export ZIP and create DB records with new IDs."""
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

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


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _ensure_unique_project_name(db: Session, name: str) -> str:
    existing = db.query(Project).filter(Project.name == name).first()
    if not existing:
        return name
    base = name
    for i in range(1, 100):
        candidate = f"{base} (imported {i})"
        if not db.query(Project).filter(Project.name == candidate).first():
            return candidate
    return f"{base} (imported {uuid4().hex[:8]})"


def _import_one_project(
    db: Session,
    payload: dict,
    zf: zipfile.ZipFile,
    attachments_dir: str,
) -> None:
    """Create one project and all related records from payload; copy attachment files from zf."""
    attachments_base = Path(attachments_dir) if attachments_dir else Path("/tmp")

    # Id maps: old_id (str) -> new_id (UUID)
    project_map: dict[str, UUID] = {}
    subnet_map: dict[str, UUID] = {}
    host_map: dict[str, UUID] = {}
    port_map: dict[str, UUID] = {}
    vuln_def_map: dict[str, UUID] = {}
    vuln_instance_map: dict[str, UUID] = {}
    evidence_map: dict[str, UUID] = {}
    tag_map: dict[str, UUID] = {}

    # 1. Project
    proj = payload["project"]
    old_project_id = proj["id"]
    name = _ensure_unique_project_name(db, proj["name"])
    new_project_id = uuid4()
    project_map[old_project_id] = new_project_id
    db.add(
        Project(
            id=new_project_id,
            name=name,
            description=proj.get("description"),
            start_date=_parse_dt(proj.get("start_date")),
            end_date=_parse_dt(proj.get("end_date")),
            countdown_red_days_default=proj.get("countdown_red_days_default", 7),
            scope_policy=proj.get("scope_policy"),
            sort_mode=proj.get("sort_mode", "cidr_asc"),
        )
    )
    db.flush()

    # 2. Subnets
    for s in payload.get("subnets", []):
        new_id = uuid4()
        subnet_map[s["id"]] = new_id
        db.add(
            Subnet(
                id=new_id,
                project_id=new_project_id,
                cidr=s["cidr"],
                name=s.get("name"),
                in_scope=s.get("in_scope", True),
            )
        )
    db.flush()

    # 3. Hosts
    for h in payload.get("hosts", []):
        new_id = uuid4()
        host_map[h["id"]] = new_id
        db.add(
            Host(
                id=new_id,
                project_id=new_project_id,
                subnet_id=subnet_map.get(h["subnet_id"]) if h.get("subnet_id") else None,
                ip=h["ip"],
                dns_name=h.get("dns_name"),
                tags=h.get("tags") or [],
                status=h.get("status", "unknown"),
                whois_data=h.get("whois_data"),
                in_scope=h.get("in_scope", True),
            )
        )
    db.flush()

    # 4. Ports
    for p in payload.get("ports", []):
        new_id = uuid4()
        port_map[p["id"]] = new_id
        db.add(
            Port(
                id=new_id,
                host_id=host_map[p["host_id"]],
                protocol=p["protocol"],
                number=p["number"],
                state=p.get("state"),
                service_name=p.get("service_name"),
                service_version=p.get("service_version"),
                banner=p.get("banner"),
                description_md=p.get("description_md"),
                evidence_md=p.get("evidence_md"),
                discovered_by=p.get("discovered_by"),
                scanned_at=_parse_dt(p.get("scanned_at")),
                scan_metadata=p.get("scan_metadata"),
            )
        )
    db.flush()

    # 5. Applications
    for a in payload.get("applications", []):
        db.add(
            Application(
                id=uuid4(),
                host_id=host_map[a["host_id"]],
                port_id=port_map.get(a["port_id"]) if a.get("port_id") else None,
                type=a.get("type"),
                url=a.get("url"),
                metadata_=a.get("metadata"),
            )
        )
    db.flush()

    # 6. VulnerabilityDefinitions
    for v in payload.get("vulnerability_definitions", []):
        new_id = uuid4()
        vuln_def_map[v["id"]] = new_id
        db.add(
            VulnerabilityDefinition(
                id=new_id,
                project_id=new_project_id,
                title=v["title"],
                description_md=v.get("description_md"),
                remediation_md=v.get("remediation_md"),
                evidence_md=v.get("evidence_md"),
                cvss_vector=v.get("cvss_vector"),
                cvss_score=v.get("cvss_score"),
                severity=v.get("severity"),
                cve_ids=v.get("cve_ids") or [],
                references=v.get("references") or [],
                discovered_by=v.get("discovered_by"),
            )
        )
    db.flush()

    # 7. VulnerabilityInstances
    for vi in payload.get("vulnerability_instances", []):
        new_id = uuid4()
        vuln_instance_map[vi["id"]] = new_id
        db.add(
            VulnerabilityInstance(
                id=new_id,
                project_id=new_project_id,
                vulnerability_definition_id=vuln_def_map[vi["vulnerability_definition_id"]],
                host_id=host_map[vi["host_id"]],
                port_id=port_map.get(vi["port_id"]) if vi.get("port_id") else None,
                status=vi.get("status", "open"),
                notes_md=vi.get("notes_md"),
            )
        )
    db.flush()

    # 8. Evidence (metadata first; copy files from ZIP)
    for e in payload.get("evidence", []):
        new_id = uuid4()
        evidence_map[e["id"]] = new_id
        stored_path = None
        thumbnail_path = None
        try:
            names = [n for n in zf.namelist() if n.startswith(f"attachments/evidence/{e['id']}/") and "thumbnail_" not in n]
            thumb_names = [n for n in zf.namelist() if n.startswith(f"attachments/evidence/{e['id']}/") and "thumbnail_" in n]
            if names:
                dest_dir = attachments_base / "evidence" / "imported" / str(new_id)
                dest_dir.mkdir(parents=True, exist_ok=True)
                src_name = names[0]
                dest_name = Path(src_name).name
                dest_file = dest_dir / dest_name
                dest_file.write_bytes(zf.read(src_name))
                stored_path = str(dest_file)
            if thumb_names:
                dest_dir = attachments_base / "evidence" / "imported" / str(new_id)
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest_file = dest_dir / Path(thumb_names[0]).name
                dest_file.write_bytes(zf.read(thumb_names[0]))
                thumbnail_path = str(dest_file)
        except (KeyError, OSError):
            pass
        db.add(
            Evidence(
                id=new_id,
                project_id=new_project_id,
                host_id=host_map.get(e["host_id"]) if e.get("host_id") else None,
                port_id=port_map.get(e["port_id"]) if e.get("port_id") else None,
                vuln_instance_id=vuln_instance_map.get(e["vuln_instance_id"]) if e.get("vuln_instance_id") else None,
                filename=e.get("filename", "file"),
                mime=e.get("mime"),
                size=e.get("size"),
                sha256=e.get("sha256"),
                caption=e.get("caption"),
                stored_path=stored_path,
                is_pasted=e.get("is_pasted", False),
                source=e.get("source"),
                imported_at=_parse_dt(e.get("imported_at")),
                source_file=e.get("source_file"),
                source_timestamp=e.get("source_timestamp"),
                notes_md=e.get("notes_md"),
                thumbnail_path=thumbnail_path,
            )
        )
    db.flush()

    # 9. Notes
    for n in payload.get("notes", []):
        db.add(
            Note(
                id=uuid4(),
                project_id=new_project_id,
                target_type=n.get("target_type", "scope"),
                target_id=n.get("target_id"),
                subnet_id=subnet_map.get(n["subnet_id"]) if n.get("subnet_id") else None,
                host_id=host_map.get(n["host_id"]) if n.get("host_id") else None,
                port_id=port_map.get(n["port_id"]) if n.get("port_id") else None,
                evidence_id=evidence_map.get(n["evidence_id"]) if n.get("evidence_id") else None,
                vuln_instance_id=vuln_instance_map.get(n["vuln_instance_id"]) if n.get("vuln_instance_id") else None,
                body_md=n.get("body_md"),
            )
        )
    db.flush()

    # 10. Todos
    for t in payload.get("todos", []):
        db.add(
            Todo(
                id=uuid4(),
                project_id=new_project_id,
                target_type=t.get("target_type", "scope"),
                target_id=t.get("target_id"),
                title=t["title"],
                body=t.get("body"),
                status=t.get("status", "open"),
                subnet_id=subnet_map.get(t["subnet_id"]) if t.get("subnet_id") else None,
                host_id=host_map.get(t["host_id"]) if t.get("host_id") else None,
                port_id=port_map.get(t["port_id"]) if t.get("port_id") else None,
                completed_at=_parse_dt(t.get("completed_at")),
                completion_notes=t.get("completion_notes"),
            )
        )
    db.flush()

    # 11. SavedReports
    for sr in payload.get("saved_reports", []):
        db.add(
            SavedReport(
                id=uuid4(),
                project_id=new_project_id,
                name=sr["name"],
                description=sr.get("description"),
                data_source=sr["data_source"],
                columns=sr.get("columns", []),
                filter_expression=sr.get("filter_expression"),
            )
        )
    db.flush()

    # 12. Tags
    for t in payload.get("tags", []):
        new_id = uuid4()
        tag_map[t["id"]] = new_id
        db.add(
            Tag(
                id=new_id,
                project_id=new_project_id,
                name=t["name"],
                color=t.get("color"),
            )
        )
    db.flush()

    # 13. ItemTags (target_type can be subnet, host, port, evidence, vulnerability_instance, etc.)
    type_to_map = {
        "subnet": subnet_map,
        "host": host_map,
        "port": port_map,
        "evidence": evidence_map,
        "vulnerability_instance": vuln_instance_map,
    }
    for it in payload.get("item_tags", []):
        target_type = it.get("target_type", "host")
        target_id_old = it.get("target_id")
        if not target_id_old or target_type not in type_to_map:
            continue
        new_target_id = type_to_map[target_type].get(target_id_old)
        if new_target_id is None:
            continue
        db.add(
            ItemTag(
                id=uuid4(),
                tag_id=tag_map[it["tag_id"]],
                target_type=target_type,
                target_id=new_target_id,
            )
        )
    db.flush()

    # 14. VulnerabilityAttachments (and copy files)
    for va in payload.get("vulnerability_attachments", []):
        new_def_id = vuln_def_map.get(va["vulnerability_definition_id"])
        if not new_def_id:
            continue
        zip_path = f"attachments/vuln_def/{va['vulnerability_definition_id']}/{va.get('filename', 'file')}"
        stored_path = None
        try:
            if zip_path in zf.namelist():
                dest_dir = attachments_base / "vuln_def" / str(new_def_id)
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest_file = dest_dir / va.get("filename", "file")
                dest_file.write_bytes(zf.read(zip_path))
                stored_path = str(dest_file)
        except (KeyError, OSError):
            pass
        if not stored_path:
            continue
        db.add(
            VulnerabilityAttachment(
                id=uuid4(),
                vulnerability_definition_id=new_def_id,
                filename=va.get("filename", "file"),
                mime=va.get("mime"),
                size=va.get("size"),
                stored_path=stored_path,
                is_pasted=va.get("is_pasted", False),
            )
        )


def run_import_from_zip(db: Session, zip_path: str, attachments_dir: str) -> None:
    """Open ZIP at zip_path, parse manifest and project payloads, create all records."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        manifest_data = zf.read("manifest.json")
    manifest = json.loads(manifest_data)
    if manifest.get("version") != 1:
        raise ValueError(f"Unsupported manifest version: {manifest.get('version')}")

    with zipfile.ZipFile(zip_path, "r") as zf:
        for proj_entry in manifest.get("projects", []):
            old_id = proj_entry["id"]
            project_file = f"projects/{old_id}.json"
            if project_file not in zf.namelist():
                continue
            payload = json.loads(zf.read(project_file))
            _import_one_project(db, payload, zf, attachments_dir)

"""
Custom reports: query-based data extraction from mission scope.

- Report configs define data source, fields, grouping, default filters.
- No raw SQL; uses SQLAlchemy query abstraction.
- New reports added by defining a new config and runner.
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.models import Host, Port, Subnet, Evidence, VulnerabilityInstance, VulnerabilityDefinition
from app.services.report_filter import parse_filter, entity_matches_filter


@dataclass
class ReportFilters:
    """Filters aligned with tree filter system."""

    exclude_unresolved: bool = True
    status: str | None = None  # "online" | "offline" | "unknown" | None (all)
    subnet_id: UUID | None = None
    port_number: int | None = None
    port_protocol: str | None = None
    severity: str | None = None  # Critical, High, Medium, Low, Info


@dataclass
class ReportConfig:
    """Report definition: id, name, runner."""

    id: str
    name: str


_SEVERITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}


def _run_ips(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = db.query(Host).filter(Host.project_id == project_id)
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.status:
        s = filters.status.lower()
        if s in ("online", "up"):
            q = q.filter(or_(Host.status == "online", Host.status == "up"))
        elif s in ("offline", "down"):
            q = q.filter(or_(Host.status == "offline", Host.status == "down"))
        elif s == "unknown":
            q = q.filter(or_(Host.status.is_(None), Host.status == "unknown"))
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    hosts = q.all()
    ips = sorted({h.ip for h in hosts if h.ip and h.ip.lower() != "unresolved"})
    return [{"ip": ip} for ip in ips]


def _run_hostnames(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = db.query(Host).filter(Host.project_id == project_id)
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.status:
        s = filters.status.lower()
        if s in ("online", "up"):
            q = q.filter(or_(Host.status == "online", Host.status == "up"))
        elif s in ("offline", "down"):
            q = q.filter(or_(Host.status == "offline", Host.status == "down"))
        elif s == "unknown":
            q = q.filter(or_(Host.status.is_(None), Host.status == "unknown"))
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    hosts = q.all()
    names = sorted({h.dns_name for h in hosts if h.dns_name}, key=lambda x: (x or "").lower())
    return [{"hostname": n} for n in names]


def _run_hosts_ip_dns(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = db.query(Host).filter(Host.project_id == project_id)
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.status:
        s = filters.status.lower()
        if s in ("online", "up"):
            q = q.filter(or_(Host.status == "online", Host.status == "up"))
        elif s in ("offline", "down"):
            q = q.filter(or_(Host.status == "offline", Host.status == "down"))
        elif s == "unknown":
            q = q.filter(or_(Host.status.is_(None), Host.status == "unknown"))
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    hosts = sorted(q.all(), key=lambda h: (h.ip or "", h.dns_name or ""))
    return [
        {
            "ip": h.ip,
            "dns_name": h.dns_name,
            "label": f"{h.ip} ({h.dns_name})" if h.dns_name else h.ip,
        }
        for h in hosts
        if h.ip and h.ip.lower() != "unresolved"
    ]


def _run_open_ports(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = (
        db.query(Port, Host)
        .join(Host, Port.host_id == Host.id)
        .filter(Host.project_id == project_id, Port.state == "open")
    )
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.status:
        s = filters.status.lower()
        if s in ("online", "up"):
            q = q.filter(or_(Host.status == "online", Host.status == "up"))
        elif s in ("offline", "down"):
            q = q.filter(or_(Host.status == "offline", Host.status == "down"))
        elif s == "unknown":
            q = q.filter(or_(Host.status.is_(None), Host.status == "unknown"))
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    if filters.port_number is not None:
        q = q.filter(Port.number == filters.port_number)
    if filters.port_protocol:
        q = q.filter(Port.protocol == filters.port_protocol.lower())
    rows = q.order_by(Host.ip, Port.number, Port.protocol).all()
    return [
        {
            "ip": h.ip,
            "port": p.number,
            "protocol": p.protocol,
            "service": p.service_name,
            "host_dns": h.dns_name,
        }
        for p, h in rows
    ]


def _run_hosts_by_subnet(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = (
        db.query(Host, Subnet)
        .outerjoin(Subnet, Host.subnet_id == Subnet.id)
        .filter(Host.project_id == project_id)
    )
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.status:
        s = filters.status.lower()
        if s in ("online", "up"):
            q = q.filter(or_(Host.status == "online", Host.status == "up"))
        elif s in ("offline", "down"):
            q = q.filter(or_(Host.status == "offline", Host.status == "down"))
        elif s == "unknown":
            q = q.filter(or_(Host.status.is_(None), Host.status == "unknown"))
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    rows = q.order_by(Subnet.cidr.nullslast(), Host.ip).all()
    return [
        {
            "subnet_cidr": s.cidr if s else None,
            "subnet_name": s.name if s else None,
            "ip": h.ip,
            "dns_name": h.dns_name,
            "label": f"{h.ip} ({h.dns_name})" if h.dns_name else h.ip,
        }
        for h, s in rows
        if h.ip and h.ip.lower() != "unresolved"
    ]


def _run_unresolved_hosts(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = db.query(Host).filter(Host.project_id == project_id, Host.ip == "unresolved")
    hosts = q.order_by(Host.dns_name).all()
    return [{"hostname": h.dns_name, "ip": "unresolved"} for h in hosts]


def _run_vulns_flat(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = (
        db.query(VulnerabilityInstance, VulnerabilityDefinition, Host)
        .join(VulnerabilityDefinition, VulnerabilityInstance.vulnerability_definition_id == VulnerabilityDefinition.id)
        .join(Host, VulnerabilityInstance.host_id == Host.id)
        .filter(VulnerabilityInstance.project_id == project_id)
    )
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    if filters.severity:
        q = q.filter(VulnerabilityDefinition.severity == filters.severity)
    rows = q.all()
    out = []
    for vi, vd, h in rows:
        sev = vd.severity or (f"CVSS {vd.cvss_score}" if vd.cvss_score is not None else "Info")
        out.append({
            "title": vd.title,
            "severity": sev,
            "host_ip": h.ip,
            "host_dns": h.dns_name,
            "status": vi.status,
        })
    return sorted(out, key=lambda r: (-_SEVERITY_ORDER.get(r["severity"], 99), r["title"], r["host_ip"]))


def _run_vulns_by_severity(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = (
        db.query(VulnerabilityInstance, VulnerabilityDefinition, Host)
        .join(VulnerabilityDefinition, VulnerabilityInstance.vulnerability_definition_id == VulnerabilityDefinition.id)
        .join(Host, VulnerabilityInstance.host_id == Host.id)
        .filter(VulnerabilityInstance.project_id == project_id)
    )
    if filters.exclude_unresolved:
        q = q.filter(Host.ip != "unresolved")
    if filters.subnet_id:
        q = q.filter(Host.subnet_id == filters.subnet_id)
    if filters.severity:
        q = q.filter(VulnerabilityDefinition.severity == filters.severity)
    rows = q.all()
    order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
    out = []
    for vi, vd, h in rows:
        sev = vd.severity or "Info"
        out.append({
            "severity": sev,
            "title": vd.title,
            "host_ip": h.ip,
            "host_dns": h.dns_name,
            "status": vi.status,
        })
    return sorted(out, key=lambda r: (order.get(r["severity"], 99), r["title"], r["host_ip"]))


def _run_evidence_entries(db: Session, project_id: UUID, filters: ReportFilters) -> list[dict]:
    q = (
        db.query(Evidence, Host)
        .outerjoin(Host, Evidence.host_id == Host.id)
        .filter(Evidence.project_id == project_id)
    )
    if filters.exclude_unresolved:
        q = q.filter(or_(Evidence.host_id.is_(None), Host.ip != "unresolved"))
    if filters.subnet_id:
        q = q.filter(Evidence.host_id.isnot(None), Host.subnet_id == filters.subnet_id)
    rows = q.all()
    return [
        {
            "source": ev.source or "manual",
            "caption": ev.caption or ev.filename,
            "host_ip": h.ip if h else None,
            "filename": ev.filename,
        }
        for ev, h in rows
    ]


BUILDER_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "hosts": [
        ("ip", "IP"),
        ("hostname", "Hostname"),
        ("status", "Status"),
        ("subnet_cidr", "Subnet"),
    ],
    "ports": [
        ("ip", "IP"),
        ("hostname", "Hostname"),
        ("port", "Port"),
        ("protocol", "Protocol"),
        ("service", "Service"),
        ("state", "State"),
    ],
    "evidence": [
        ("host_ip", "Host IP"),
        ("source", "Source"),
        ("caption", "Caption"),
        ("filename", "Filename"),
    ],
    "vulns": [
        ("title", "Title"),
        ("severity", "Severity"),
        ("host_ip", "Host IP"),
        ("host_dns", "Host DNS"),
        ("status", "Status"),
    ],
}


def _builder_columns_json() -> dict[str, list[list[str]]]:
    """Return BUILDER_COLUMNS as JSON-serializable dict (list of [id, label])."""
    return {k: [list(pair) for pair in v] for k, v in BUILDER_COLUMNS.items()}


def _run_builder(
    db: Session,
    project_id: UUID,
    data_source: str,
    columns: list[str],
    filter_expression: str,
) -> list[dict]:
    """Run builder report: select columns, apply filter expression."""
    pf = parse_filter(filter_expression) if filter_expression else None
    valid_cols = {c[0] for c in BUILDER_COLUMNS.get(data_source, [])}
    cols = [c for c in columns if c in valid_cols] or list(valid_cols)

    if data_source == "hosts":
        q = db.query(Host, Subnet).outerjoin(Subnet, Host.subnet_id == Subnet.id).filter(Host.project_id == project_id)
        rows = []
        for h, s in q.all():
            if pf and not entity_matches_filter(pf, "host", h, subnet_cidr=s.cidr if s else None):
                continue
            row = {}
            if "ip" in cols:
                row["ip"] = h.ip
            if "hostname" in cols:
                row["hostname"] = h.dns_name
            if "status" in cols:
                row["status"] = h.status or "unknown"
            if "subnet_cidr" in cols:
                row["subnet_cidr"] = s.cidr if s else None
            rows.append(row)
        return rows

    if data_source == "ports":
        q = (
            db.query(Port, Host, Subnet)
            .join(Host, Port.host_id == Host.id)
            .outerjoin(Subnet, Host.subnet_id == Subnet.id)
            .filter(Host.project_id == project_id)
        )
        rows = []
        for p, h, s in q.all():
            if pf and not entity_matches_filter(pf, "port", p, host=h, port=p, subnet_cidr=s.cidr if s else None):
                continue
            row = {}
            if "ip" in cols:
                row["ip"] = h.ip
            if "hostname" in cols:
                row["hostname"] = h.dns_name
            if "port" in cols:
                row["port"] = p.number
            if "protocol" in cols:
                row["protocol"] = p.protocol
            if "service" in cols:
                row["service"] = p.service_name
            if "state" in cols:
                row["state"] = p.state
            rows.append(row)
        return rows

    if data_source == "evidence":
        q = (
            db.query(Evidence, Host, Subnet)
            .outerjoin(Host, Evidence.host_id == Host.id)
            .outerjoin(Subnet, Host.subnet_id == Subnet.id)
            .filter(Evidence.project_id == project_id)
        )
        rows = []
        for ev, h, s in q.all():
            if pf:
                if not entity_matches_filter(pf, "evidence", ev, host=h, subnet_cidr=s.cidr if s else None):
                    continue
            row = {}
            if "host_ip" in cols:
                row["host_ip"] = h.ip if h else None
            if "source" in cols:
                row["source"] = ev.source or "manual"
            if "caption" in cols:
                row["caption"] = ev.caption or ev.filename
            if "filename" in cols:
                row["filename"] = ev.filename
            rows.append(row)
        return rows

    if data_source == "vulns":
        q = (
            db.query(VulnerabilityInstance, VulnerabilityDefinition, Host, Subnet)
            .join(VulnerabilityDefinition, VulnerabilityInstance.vulnerability_definition_id == VulnerabilityDefinition.id)
            .join(Host, VulnerabilityInstance.host_id == Host.id)
            .outerjoin(Subnet, Host.subnet_id == Subnet.id)
            .filter(VulnerabilityInstance.project_id == project_id)
        )
        rows = []
        for vi, vd, h, s in q.all():
            if pf and not entity_matches_filter(pf, "vuln", vi, host=h, vd=vd, vi=vi, subnet_cidr=s.cidr if s else None):
                continue
            row = {}
            if "title" in cols:
                row["title"] = vd.title
            if "severity" in cols:
                row["severity"] = vd.severity or "Info"
            if "host_ip" in cols:
                row["host_ip"] = h.ip
            if "host_dns" in cols:
                row["host_dns"] = h.dns_name
            if "status" in cols:
                row["status"] = vi.status
            rows.append(row)
        return rows

    return []


REPORT_REGISTRY: dict[str, tuple[ReportConfig, callable]] = {
    "ips": (ReportConfig("ips", "List of all IP addresses"), _run_ips),
    "hostnames": (ReportConfig("hostnames", "List of all hostnames"), _run_hostnames),
    "hosts": (ReportConfig("hosts", "List of all hosts (IP + DNS)"), _run_hosts_ip_dns),
    "open_ports": (ReportConfig("open_ports", "List of all open ports"), _run_open_ports),
    "hosts_by_subnet": (ReportConfig("hosts_by_subnet", "List of hosts by subnet"), _run_hosts_by_subnet),
    "unresolved_hosts": (ReportConfig("unresolved_hosts", "List of unresolved hosts"), _run_unresolved_hosts),
    "vulns_flat": (ReportConfig("vulns_flat", "List of vulnerabilities (flat)"), _run_vulns_flat),
    "vulns_by_severity": (ReportConfig("vulns_by_severity", "List of vulnerabilities by severity"), _run_vulns_by_severity),
    "evidence": (ReportConfig("evidence", "List of evidence entries (source + type)"), _run_evidence_entries),
}


def run_report(
    db: Session,
    project_id: UUID,
    report_type: str,
    filters: ReportFilters,
) -> tuple[list[dict], ReportConfig]:
    """Execute report and return (rows, config)."""
    entry = REPORT_REGISTRY.get(report_type)
    if not entry:
        raise ValueError(f"Unknown report type: {report_type}")
    config, runner = entry
    rows = runner(db, project_id, filters)
    return rows, config


def list_report_configs() -> list[ReportConfig]:
    """List available report configs."""
    return [cfg for cfg, _ in REPORT_REGISTRY.values()]


def run_builder(
    db: Session,
    project_id: UUID,
    data_source: str,
    columns: list[str],
    filter_expression: str,
) -> list[dict]:
    """Run builder report."""
    if data_source not in BUILDER_COLUMNS:
        raise ValueError(f"Invalid data_source: {data_source}")
    return _run_builder(db, project_id, data_source, columns, filter_expression)

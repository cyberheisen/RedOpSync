"""
Visual Report Builder: field metadata by source, and Group/Condition DSL -> SQL compiler.
Mission-scoped; no raw SQL from UI; all values parameterized.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.report import ReportGroup, ReportCondition, ReportDefinitionV2, ReportColumnSpec

# Source keys used in UI
SOURCES = ["core", "nmap", "http", "gowitness", "whois", "tls", "notes"]

# Field metadata: key, label, type, source, operators_supported
# type: string | number | boolean | date | existence
# operators_supported: list of operator keys
REPORT_FIELDS: list[dict] = [
    # Core
    {"key": "host_ip", "label": "IP", "type": "string", "source": "core", "operators_supported": ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with"]},
    {"key": "host_fqdn", "label": "Hostname", "type": "string", "source": "core", "operators_supported": ["equals", "not_equals", "contains", "not_contains", "exists", "not_exists"]},
    {"key": "host_tags", "label": "Host tags", "type": "string", "source": "core", "operators_supported": ["contains", "not_contains", "exists", "not_exists"]},
    {"key": "port", "label": "Port", "type": "number", "source": "core", "operators_supported": ["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "in_list", "not_in_list"]},
    {"key": "proto", "label": "Proto", "type": "string", "source": "core", "operators_supported": ["equals", "not_equals"]},
    {"key": "state", "label": "State", "type": "string", "source": "core", "operators_supported": ["equals", "not_equals", "contains"]},
    {"key": "last_seen", "label": "Last Seen", "type": "date", "source": "core", "operators_supported": ["before", "after", "between", "last_n_days"]},
    # Nmap
    {"key": "service_name", "label": "Service name", "type": "string", "source": "nmap", "operators_supported": ["equals", "not_equals", "contains", "not_contains", "exists", "not_exists"]},
    {"key": "service_version", "label": "Version", "type": "string", "source": "nmap", "operators_supported": ["equals", "contains", "exists", "not_exists"]},
    {"key": "banner", "label": "Banner", "type": "string", "source": "nmap", "operators_supported": ["contains", "exists", "not_exists"]},
    # HTTP (from evidence / service_current)
    {"key": "latest_http_title", "label": "HTTP Title", "type": "string", "source": "http", "operators_supported": ["equals", "contains", "not_contains", "exists", "not_exists"]},
    {"key": "latest_http_server", "label": "Server", "type": "string", "source": "http", "operators_supported": ["equals", "contains", "not_contains", "exists", "not_exists"]},
    {"key": "latest_http_status_code", "label": "Status code", "type": "number", "source": "http", "operators_supported": ["equals", "not_equals", "gt", "gte", "lt", "lte", "in_list", "exists", "not_exists"]},
    {"key": "has_http", "label": "Has HTTP", "type": "boolean", "source": "http", "operators_supported": ["is_true", "is_false"]},
    # GoWitness
    {"key": "screenshot_path", "label": "Screenshot path", "type": "string", "source": "gowitness", "operators_supported": ["exists", "not_exists"]},
    {"key": "latest_gowitness_tech", "label": "Tech fingerprint", "type": "string", "source": "gowitness", "operators_supported": ["contains", "exists", "not_exists"]},
    # WHOIS
    {"key": "whois_asn", "label": "ASN", "type": "string", "source": "whois", "operators_supported": ["equals", "not_equals", "contains", "exists", "not_exists"]},
    {"key": "whois_org", "label": "ASN Org", "type": "string", "source": "whois", "operators_supported": ["equals", "contains", "not_contains", "exists", "not_exists"]},
    {"key": "whois_cidr", "label": "CIDR", "type": "string", "source": "whois", "operators_supported": ["equals", "contains", "exists", "not_exists"]},
    {"key": "whois_country", "label": "Country", "type": "string", "source": "whois", "operators_supported": ["equals", "contains", "exists", "not_exists"]},
    # TLS (we don't have separate TLS columns in service_current yet; reuse or placeholder)
    {"key": "latest_evidence_caption", "label": "Evidence caption", "type": "string", "source": "tls", "operators_supported": ["contains", "exists", "not_exists"]},
]

# Map field key -> SQL expression for SELECT (service_current view)
SELECT_EXPR: dict[str, str] = {
    "host_ip": "host_ip",
    "host_fqdn": "host_fqdn",
    "host_tags": "host_tags",
    "service_id": "service_id",
    "proto": "proto",
    "port": "port",
    "state": "state",
    "last_seen": "last_seen",
    "service_name": "service_name",
    "service_version": "service_version",
    "banner": "banner",
    "scan_metadata": "scan_metadata",
    "whois_data": "whois_data",
    "latest_evidence_caption": "latest_evidence_caption",
    "screenshot_path": "screenshot_path",
    "latest_http_title": "latest_http_title",
    "latest_http_server": "latest_http_server",
    "latest_http_status_code": "latest_http_status_code",
    "latest_gowitness_tech": "latest_gowitness_tech",
    "has_http": "(screenshot_path IS NOT NULL OR latest_http_title IS NOT NULL)",
    "whois_asn": "(whois_data->>'asn')",
    "whois_org": "COALESCE(whois_data->>'asn_description', whois_data->>'network_name')",
    "whois_cidr": "(whois_data->>'cidr')",
    "whois_country": "COALESCE(whois_data->>'country', whois_data->>'asn_country')",
}

ALLOWED_FIELD_KEYS = set(SELECT_EXPR.keys())


def get_fields_for_sources(sources: list[str]) -> list[dict]:
    """Return field metadata for the given sources (e.g. ['core','nmap','http'])."""
    if not sources:
        return REPORT_FIELDS
    return [f for f in REPORT_FIELDS if f["source"] in sources]


def _condition_sql(c: ReportCondition, param_prefix: str) -> tuple[str, dict]:
    """Build one condition SQL and params. Returns (fragment, params)."""
    field = (c.field or "").strip()
    if field not in ALLOWED_FIELD_KEYS:
        return "1=0", {}
    op = (c.operator or "").strip().lower()
    col = SELECT_EXPR[field]
    if col.startswith("("):
        col_expr = col
    else:
        col_expr = col
    params: dict = {}

    # host_tags is an array; use array_to_string for text search and array_length for exists/not_exists
    if field == "host_tags":
        if op == "contains":
            params[f"{param_prefix}_v"] = f"%{str(c.value or '')}%"
            return "COALESCE(array_to_string(host_tags, ' '), '') ILIKE :" + f"{param_prefix}_v", params
        if op == "not_contains":
            params[f"{param_prefix}_v"] = f"%{str(c.value or '')}%"
            return "(host_tags IS NULL OR COALESCE(array_to_string(host_tags, ' '), '') NOT ILIKE :" + f"{param_prefix}_v)", params
        if op == "exists":
            return "(host_tags IS NOT NULL AND array_length(host_tags, 1) > 0)", params
        if op == "not_exists":
            return "(host_tags IS NULL OR array_length(host_tags, 1) IS NULL)", params
        return "1=0", params

    # String operators
    if op in ("equals", "="):
        params[f"{param_prefix}_v"] = c.value
        return f"COALESCE({col_expr}::text, '') = :{param_prefix}_v", params
    if op in ("not_equals", "!="):
        params[f"{param_prefix}_v"] = c.value
        return f"COALESCE({col_expr}::text, '') != :{param_prefix}_v", params
    if op == "contains":
        params[f"{param_prefix}_v"] = f"%{str(c.value or '')}%"
        return f"{col_expr}::text ILIKE :{param_prefix}_v", params
    if op == "not_contains":
        params[f"{param_prefix}_v"] = f"%{str(c.value or '')}%"
        return f"({col_expr}::text IS NULL OR {col_expr}::text NOT ILIKE :{param_prefix}_v)", params
    if op == "starts_with":
        params[f"{param_prefix}_v"] = f"{str(c.value or '')}%"
        return f"{col_expr}::text ILIKE :{param_prefix}_v", params
    if op == "ends_with":
        params[f"{param_prefix}_v"] = f"%{str(c.value or '')}"
        return f"{col_expr}::text ILIKE :{param_prefix}_v", params
    if op == "regex":
        params[f"{param_prefix}_v"] = str(c.value or "")
        return f"{col_expr}::text ~* :{param_prefix}_v", params

    # Number operators
    if op in ("gt", ">"):
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr})::numeric > :{param_prefix}_v", params
    if op in ("gte", ">="):
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr})::numeric >= :{param_prefix}_v", params
    if op in ("lt", "<"):
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr})::numeric < :{param_prefix}_v", params
    if op in ("lte", "<="):
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr})::numeric <= :{param_prefix}_v", params
    if op == "between" and isinstance(c.value, (list, tuple)) and len(c.value) >= 2:
        params[f"{param_prefix}_lo"] = c.value[0]
        params[f"{param_prefix}_hi"] = c.value[1]
        return f"({col_expr})::numeric BETWEEN :{param_prefix}_lo AND :{param_prefix}_hi", params
    if op == "in_list":
        val_list = c.value if isinstance(c.value, list) else [c.value]
        vals = [v for v in val_list if v is not None]
        params[f"{param_prefix}_list"] = vals
        if field in ("port", "latest_http_status_code") and all(isinstance(v, (int, float)) for v in vals):
            return f"({col_expr}) = ANY(:{param_prefix}_list)", params
        return f"({col_expr})::text = ANY(:{param_prefix}_list)", params
    if op == "not_in_list":
        val_list = c.value if isinstance(c.value, list) else [c.value]
        vals = [v for v in val_list if v is not None]
        params[f"{param_prefix}_list"] = vals
        if field in ("port", "latest_http_status_code") and all(isinstance(v, (int, float)) for v in vals):
            return f"NOT (({col_expr}) = ANY(:{param_prefix}_list))", params
        return f"NOT (({col_expr})::text = ANY(:{param_prefix}_list))", params

    # Boolean
    if op in ("is_true", "true"):
        return f"({col_expr}) IS TRUE", params
    if op in ("is_false", "false"):
        return f"({col_expr}) IS FALSE", params

    # Existence
    if op in ("exists", "is_not_null"):
        return f"({col_expr}) IS NOT NULL AND ({col_expr})::text != ''", params
    if op in ("not_exists", "is_null"):
        return f"({col_expr}) IS NULL OR ({col_expr})::text = ''", params

    # Date
    if op == "after":
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr}) >= :{param_prefix}_v", params
    if op == "before":
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr}) <= :{param_prefix}_v", params
    if op == "last_n_days":
        # value = N (int); we use last_seen >= now() - N days
        params[f"{param_prefix}_v"] = c.value
        return f"({col_expr}) >= (NOW() - (:{param_prefix}_v || ' days')::interval)", params

    return "1=0", params


_counter = [0]


def _next_id() -> int:
    _counter[0] += 1
    return _counter[0]


def _compile_group(g: ReportGroup, prefix: str) -> tuple[str, dict]:
    """Recursively compile a group to (sql_fragment, params)."""
    parts: list[str] = []
    all_params: dict = {}
    for i, child in enumerate(g.children or []):
        if isinstance(child, ReportCondition):
            frag, prm = _condition_sql(child, f"{prefix}_c{i}_{_next_id()}")
            parts.append(f"({frag})")
            all_params.update(prm)
        elif isinstance(child, ReportGroup):
            frag, prm = _compile_group(child, f"{prefix}_g{i}_{_next_id()}")
            parts.append(f"({frag})")
            all_params.update(prm)
    if not parts:
        return "1=1", all_params
    joiner = " AND " if (g.op or "AND").upper() == "AND" else " OR "
    return joiner.join(parts), all_params


def execute_report_v2(
    db: Session,
    project_id: UUID,
    definition: ReportDefinitionV2,
) -> tuple[list[str], list[dict], int]:
    """
    Execute ReportDefinitionV2 against service_current.
    Returns (column_keys, rows, total_count).
    """
    params: dict = {"project_id": str(project_id)}
    where_sql = "1=1"
    if definition.filter and (definition.filter.children or []):
        _counter[0] = 0
        where_sql, filter_params = _compile_group(definition.filter, "f")
        params.update(filter_params)

    # Columns: from definition.columns (ReportColumnSpec) or default
    col_specs: list[ReportColumnSpec] = definition.columns or []
    if not col_specs:
        col_specs = [
            ReportColumnSpec(key="host_ip"),
            ReportColumnSpec(key="port"),
            ReportColumnSpec(key="proto"),
            ReportColumnSpec(key="state"),
            ReportColumnSpec(key="service_name"),
            ReportColumnSpec(key="latest_http_title"),
            ReportColumnSpec(key="whois_asn"),
        ]
    keys = [c.key for c in col_specs if c.key in SELECT_EXPR]
    if not keys:
        keys = ["host_ip", "port", "proto", "state", "service_name", "latest_http_title", "whois_asn"]
    # Include service_id for tagging (each row is a port); do not add to returned column list
    select_keys = keys + ["service_id"] if "service_id" not in keys else keys
    select_parts = [f"{SELECT_EXPR[k]} AS {k}" for k in select_keys]
    select_sql = ", ".join(select_parts)

    # Sort
    order_parts: list[str] = []
    for s in definition.sort or []:
        if s.key not in ALLOWED_FIELD_KEYS:
            continue
        expr = SELECT_EXPR.get(s.key, s.key)
        direction = "DESC" if (s.direction or "asc").lower() == "desc" else "ASC"
        order_parts.append(f"{expr} {direction}")
    if not order_parts:
        order_parts = ["host_ip ASC", "port ASC"]
    order_sql = "ORDER BY " + ", ".join(order_parts)

    limit = min(definition.limit, 10000)
    offset = definition.offset

    count_sql = text(f"SELECT COUNT(*) AS n FROM service_current WHERE project_id = :project_id AND {where_sql}")
    count_row = db.execute(count_sql, params).fetchone()
    total_count = count_row[0] if count_row else 0

    params["limit"] = limit
    params["offset"] = offset
    data_sql = text(
        f"SELECT {select_sql} FROM service_current WHERE project_id = :project_id AND {where_sql} {order_sql} LIMIT :limit OFFSET :offset"
    )
    rows_raw = db.execute(data_sql, params).fetchall()

    rows: list[dict] = []
    for r in rows_raw:
        row = {}
        for i, k in enumerate(select_keys):
            if i < len(r):
                v = r[i]
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
                elif hasattr(v, "__iter__") and not isinstance(v, (str, bytes)):
                    try:
                        row[k] = list(v) if v is not None else None
                    except Exception:
                        row[k] = v
                else:
                    row[k] = v
        # Add tagging targets (bulk tag API); service_current rows are ports
        sid = row.get("service_id")
        if sid is not None:
            row["_target_type"] = "port"
            row["_target_id"] = str(sid)
        if "service_id" in row and "service_id" not in keys:
            del row["service_id"]
        rows.append(row)

    return keys, rows, total_count

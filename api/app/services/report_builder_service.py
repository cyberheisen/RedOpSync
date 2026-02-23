"""
Report Builder: execute structured report definitions against service_current view.
Safe querying: no raw SQL from UI; DSL compiled to parameterized SQLAlchemy.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.report import (
    ReportDefinition,
    ReportFilterDSL,
    ReportSortSpec,
    PortFilter,
    LastSeenFilter,
)

# Allowed columns for SELECT and ORDER BY (whitelist)
SERVICE_CURRENT_COLUMNS = {
    "project_id",
    "host_id",
    "host_ip",
    "host_fqdn",
    "host_tags",
    "service_id",
    "proto",
    "port",
    "state",
    "last_seen",
    "service_name",
    "service_version",
    "banner",
    "scan_metadata",
    "whois_data",
    "latest_evidence_caption",
    "screenshot_path",
    "latest_http_title",
    "latest_http_server",
    "latest_http_status_code",
    "latest_gowitness_tech",
    "has_http",
    "whois_asn",
    "whois_org",
    "whois_cidr",
    "whois_country",
}

# Columns we expose in SELECT (including computed)
SELECT_COLUMN_EXPRESSIONS = {
    "project_id": "project_id",
    "host_id": "host_id",
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


def _compile_filters(filters: list[ReportFilterDSL]) -> tuple[list[str], dict]:
    """Build WHERE clause fragments and bound params from filter DSL. Mission scoping is applied by caller."""
    conditions: list[str] = []
    params: dict = {}
    idx = 0

    for dsl in filters:
        if dsl.port is not None:
            if isinstance(dsl.port, int):
                key = f"port_eq_{idx}"
                conditions.append(f"port = :{key}")
                params[key] = dsl.port
            elif isinstance(dsl.port, PortFilter):
                pf = dsl.port
                if pf.eq is not None:
                    key = f"port_eq_{idx}"
                    conditions.append(f"port = :{key}")
                    params[key] = pf.eq
                if pf.in_ is not None:
                    key = f"port_in_{idx}"
                    conditions.append(f"port = ANY(:{key})")
                    params[key] = pf.in_
                if pf.not_in is not None:
                    key = f"port_not_in_{idx}"
                    conditions.append(f"NOT (port = ANY(:{key}))")
                    params[key] = pf.not_in
                if pf.range_ is not None and len(pf.range_) >= 2:
                    key_min, key_max = f"port_min_{idx}", f"port_max_{idx}"
                    conditions.append(f"port >= :{key_min} AND port <= :{key_max}")
                    params[key_min] = pf.range_[0]
                    params[key_max] = pf.range_[1]
            idx += 1

        if dsl.proto is not None:
            conditions.append(f"LOWER(proto::text) = LOWER(:proto_{idx})")
            params[f"proto_{idx}"] = dsl.proto.strip()
            idx += 1

        if dsl.state is not None:
            conditions.append(f"state = :state_{idx}")
            params[f"state_{idx}"] = dsl.state.strip()
            idx += 1

        if dsl.has_http is not None:
            if dsl.has_http:
                conditions.append("(screenshot_path IS NOT NULL OR latest_http_title IS NOT NULL)")
            else:
                conditions.append("(screenshot_path IS NULL AND latest_http_title IS NULL)")
            idx += 1

        if dsl.http_status is not None:
            conditions.append(f"latest_http_status_code = :http_status_{idx}")
            params[f"http_status_{idx}"] = dsl.http_status
            idx += 1

        if dsl.server_contains is not None and dsl.server_contains.strip():
            conditions.append(f"latest_http_server ILIKE :server_contains_{idx}")
            params[f"server_contains_{idx}"] = f"%{dsl.server_contains.strip()}%"
            idx += 1

        if dsl.title_contains is not None and dsl.title_contains.strip():
            conditions.append(f"latest_http_title ILIKE :title_contains_{idx}")
            params[f"title_contains_{idx}"] = f"%{dsl.title_contains.strip()}%"
            idx += 1

        if dsl.product_contains is not None and dsl.product_contains.strip():
            conditions.append(
                f"(service_name ILIKE :product_contains_{idx} OR (scan_metadata->>'product') ILIKE :product_contains_{idx})"
            )
            params[f"product_contains_{idx}"] = f"%{dsl.product_contains.strip()}%"
            idx += 1

        if dsl.cpe_contains is not None and dsl.cpe_contains.strip():
            conditions.append(f"(scan_metadata::text ILIKE :cpe_contains_{idx})")
            params[f"cpe_contains_{idx}"] = f"%{dsl.cpe_contains.strip()}%"
            idx += 1

        if dsl.asn is not None and str(dsl.asn).strip():
            conditions.append(f"(whois_data->>'asn') = :asn_{idx}")
            params[f"asn_{idx}"] = str(dsl.asn).strip()
            idx += 1

        if dsl.org_contains is not None and dsl.org_contains.strip():
            conditions.append(
                f"COALESCE(whois_data->>'asn_description', whois_data->>'network_name') ILIKE :org_contains_{idx}"
            )
            params[f"org_contains_{idx}"] = f"%{dsl.org_contains.strip()}%"
            idx += 1

        if dsl.country_contains is not None and dsl.country_contains.strip():
            conditions.append(
                f"COALESCE(whois_data->>'country', whois_data->>'asn_country') ILIKE :country_contains_{idx}"
            )
            params[f"country_contains_{idx}"] = f"%{dsl.country_contains.strip()}%"
            idx += 1

        if dsl.last_seen is not None:
            ls = dsl.last_seen
            if getattr(ls, "after", None) is not None:
                conditions.append(f"last_seen >= :last_seen_after_{idx}")
                params[f"last_seen_after_{idx}"] = ls.after
            if getattr(ls, "before", None) is not None:
                conditions.append(f"last_seen <= :last_seen_before_{idx}")
                params[f"last_seen_before_{idx}"] = ls.before
            idx += 1

        if dsl.tags_contains is not None and dsl.tags_contains.strip():
            conditions.append(f"array_to_string(host_tags, ' ') ILIKE :tags_contains_{idx}")
            params[f"tags_contains_{idx}"] = f"%{dsl.tags_contains.strip()}%"
            idx += 1

    return conditions, params


def _compile_order(sort: ReportSortSpec | None) -> str:
    """Return ORDER BY fragment. Column must be in whitelist."""
    if not sort or not sort.column:
        return "ORDER BY host_ip, port"
    col = sort.column.strip()
    if col not in SERVICE_CURRENT_COLUMNS:
        return "ORDER BY host_ip, port"
    direction = "DESC" if sort.descending else "ASC"
    expr = SELECT_COLUMN_EXPRESSIONS.get(col, col)
    if expr.startswith("("):
        return f"ORDER BY {expr} {direction}"
    return f"ORDER BY {col} {direction}"


def execute_report(
    db: Session,
    project_id: UUID,
    definition: ReportDefinition,
) -> tuple[list[str], list[dict], int]:
    """
    Execute report definition against service_current. Mission-scoped (project_id).
    Returns (columns, rows, total_count). No raw SQL from UI; all params bound.
    """
    conditions, params = _compile_filters(definition.filters)
    params["project_id"] = str(project_id)

    where_sql = " AND ".join(conditions) if conditions else "1=1"
    order_sql = _compile_order(definition.sort)

    # Column selection: whitelist only
    requested = [c for c in definition.columns if c in SELECT_COLUMN_EXPRESSIONS]
    if not requested:
        requested = ["host_ip", "port", "proto", "state", "service_name", "latest_http_title", "whois_asn"]
    select_parts = [f"{SELECT_COLUMN_EXPRESSIONS[c]} AS {c}" for c in requested]
    select_sql = ", ".join(select_parts)

    # Total count (same filters, no limit/offset)
    count_sql = text(
        f"SELECT COUNT(*) AS n FROM service_current WHERE project_id = :project_id AND {where_sql}"
    )
    count_result = db.execute(count_sql, params).fetchone()
    total_count = count_result[0] if count_result else 0

    # Data query with limit/offset
    limit = min(definition.limit, 10000)
    offset = definition.offset
    data_sql = text(
        f"SELECT {select_sql} FROM service_current WHERE project_id = :project_id AND {where_sql} {order_sql} LIMIT :limit OFFSET :offset"
    )
    params["limit"] = limit
    params["offset"] = offset
    rows_raw = db.execute(data_sql, params).fetchall()

    # Convert rows to list of dicts; handle datetime/json
    columns = requested
    rows = []
    for r in rows_raw:
        row = {}
        for i, col in enumerate(columns):
            if i < len(r):
                val = r[i]
                if hasattr(val, "isoformat"):
                    row[col] = val.isoformat()
                elif hasattr(val, "__iter__") and not isinstance(val, (str, bytes)):
                    try:
                        row[col] = list(val) if val is not None else None
                    except Exception:
                        row[col] = val
                else:
                    row[col] = val
        rows.append(row)

    return columns, rows, total_count

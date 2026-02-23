"""
Tests for unified report filters: report_filters_to_expression, parse_filters, and run_report.
"""
from uuid import uuid4

import pytest

from app.services.report_filter import parse_filter, parse_filters
from app.services.reports import (
    ReportFilters,
    list_report_configs,
    report_filters_to_expression,
    run_report,
)


def test_report_filters_to_expression_defaults():
    """Default filters (exclude_unresolved=True) produce unresolved == false."""
    f = ReportFilters(exclude_unresolved=True)
    clauses = report_filters_to_expression(f)
    assert "unresolved == false" in clauses
    assert len(clauses) == 1


def test_report_filters_to_expression_include_unresolved():
    """When exclude_unresolved=False, no unresolved clause is added so hostnames report includes unresolved."""
    f = ReportFilters(exclude_unresolved=False)
    clauses = report_filters_to_expression(f)
    assert "unresolved == false" not in clauses


def test_report_filters_to_expression_status():
    f = ReportFilters(exclude_unresolved=True, status="online")
    clauses = report_filters_to_expression(f)
    assert "unresolved == false" in clauses
    assert "online exists" in clauses

    f = ReportFilters(status="offline")
    clauses = report_filters_to_expression(f)
    assert "offline exists" in clauses

    f = ReportFilters(status="unknown")
    clauses = report_filters_to_expression(f)
    assert "status == unknown" in clauses


def test_report_filters_to_expression_subnet_cidr():
    f = ReportFilters(exclude_unresolved=True, subnet_id=uuid4())
    clauses = report_filters_to_expression(f)  # no subnet_cidr passed
    assert "unresolved == false" in clauses
    assert not any("subnet" in c for c in clauses)

    clauses = report_filters_to_expression(f, subnet_cidr="10.0.0.0/24")
    assert any("subnet" in c for c in clauses)
    assert 'subnet == "10.0.0.0/24"' in clauses


def test_report_filters_to_expression_port_and_severity():
    f = ReportFilters(port_number=443, port_protocol="tcp")
    clauses = report_filters_to_expression(f)
    assert "port == 443" in clauses
    assert 'protocol == "tcp"' in clauses

    f = ReportFilters(severity="High")
    clauses = report_filters_to_expression(f)
    assert "severity >= High" in clauses


def test_parse_filters():
    assert parse_filters([]) == []
    assert parse_filters(["  "]) == []
    one = parse_filters(['ip contains "10."'])
    assert len(one) == 1
    assert one[0].attr == "ip"
    assert one[0].op == "contains"
    assert one[0].value == "10."

    two = parse_filters(["unresolved == false", "port == 443"])
    assert len(two) == 2
    assert two[0].attr == "unresolved"
    assert two[0].value is False
    assert two[1].attr == "port"
    assert two[1].value == 443


def test_parse_filter_single():
    pf = parse_filter("severity >= High")
    assert pf is not None
    assert pf.attr == "severity"
    assert pf.op == ">="
    assert pf.value == "High"


def test_list_report_configs():
    configs = list_report_configs()
    ids = [c.id for c in configs]
    assert "ips" in ids
    assert "hostnames" in ids
    assert "open_ports" in ids
    assert "vulns_flat" in ids
    assert "evidence" in ids
    # Canned "not captured" and host-detail reports
    assert "hosts_not_gowitness" in ids
    assert "hosts_not_nmap" in ids
    assert "hosts_not_masscan" in ids
    assert "hosts_without_whois" in ids
    assert "host_detail_per_port" in ids
    assert "technologies_per_host_port" in ids
    assert "host_identities" in ids


def test_run_report_unknown_type():
    from sqlalchemy.orm import Session
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        pid = uuid4()
        with pytest.raises(ValueError, match="Unknown report type"):
            run_report(db, pid, "nonexistent", ReportFilters())
    finally:
        db.close()


def test_run_report_integration(client, project_id, subnet_id, host_id):
    """Run predefined reports via API; assert structure and that filters are applied."""
    # List configs
    r = client.get(f"/api/projects/{project_id}/reports/configs")
    assert r.status_code == 200
    configs = r.json()
    assert isinstance(configs, list)
    assert any(c["id"] == "ips" for c in configs)

    # Run ips report with default filters
    r = client.post(
        f"/api/projects/{project_id}/reports/run",
        json={
            "report_type": "ips",
            "filters": {"exclude_unresolved": True, "status": None, "subnet_id": None},
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data
    assert "report_name" in data
    assert data["report_type"] == "ips"
    # One host from fixture (10.0.0.1)
    assert data["count"] >= 1
    assert any(row.get("ip") == "10.0.0.1" for row in data["rows"])

    # Run hosts report with subnet filter (same subnet as fixture)
    r = client.post(
        f"/api/projects/{project_id}/reports/run",
        json={
            "report_type": "hosts",
            "filters": {
                "exclude_unresolved": True,
                "status": None,
                "subnet_id": subnet_id,
                "port_number": None,
                "port_protocol": None,
                "severity": None,
            },
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 1
    assert any(row.get("ip") == "10.0.0.1" for row in data["rows"])

    # Run open_ports (fixture has no ports from test_crud; may be 0 or more)
    r = client.post(
        f"/api/projects/{project_id}/reports/run",
        json={
            "report_type": "open_ports",
            "filters": {
                "exclude_unresolved": True,
                "status": None,
                "subnet_id": None,
                "port_number": None,
                "port_protocol": None,
                "severity": None,
            },
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data
    assert data["report_type"] == "open_ports"


# ---- Report Builder (service_current) filter DSL and mission scoping ----

def test_report_builder_filter_compilation():
    """Filter DSL compiles to parameterized conditions (no raw SQL from UI)."""
    from app.services.report_builder_service import _compile_filters
    from app.schemas.report import ReportFilterDSL, PortFilter, ReportDefinition

    # Empty filters
    conditions, params = _compile_filters([])
    assert conditions == []
    assert params == {}

    # Port eq
    conditions, params = _compile_filters([ReportFilterDSL(port=443)])
    assert any("port =" in c for c in conditions)
    assert any(443 == v for v in params.values())

    # Port not_in
    conditions, params = _compile_filters([ReportFilterDSL(port=PortFilter(not_in=[80, 443]))])
    assert any("NOT" in c and "port" in c for c in conditions)
    assert any(v == [80, 443] for v in params.values())

    # State and has_http
    conditions, params = _compile_filters([
        ReportFilterDSL(state="open"),
        ReportFilterDSL(has_http=True),
    ])
    assert any("state =" in c for c in conditions)
    assert any("screenshot_path IS NOT NULL" in c or "latest_http_title" in c for c in conditions)

    # title_contains and org_contains (ILIKE)
    conditions, params = _compile_filters([
        ReportFilterDSL(title_contains="admin"),
        ReportFilterDSL(org_contains="Amazon"),
    ])
    assert any("latest_http_title ILIKE" in c for c in conditions)
    assert any("asn_description" in c or "network_name" in c for c in conditions)
    assert "%admin%" in params.values() or any("%admin%" in str(v) for v in params.values())
    assert "%Amazon%" in params.values() or any("%Amazon%" in str(v) for v in params.values())


def test_report_builder_mission_scoping(client, project_id):
    """Execute report is mission-scoped: only project_id filter is applied server-side."""
    # Execute with empty definition (no filters) - should return columns and rows for this project only
    r = client.post(
        f"/api/projects/{project_id}/reports/execute",
        json={
            "definition": {
                "filters": [],
                "columns": ["host_ip", "port", "state", "service_name"],
                "sort": {"column": "host_ip", "descending": False},
                "limit": 10,
                "offset": 0,
            },
        },
    )
    # May 200 with empty rows if no ports, or 200 with data; never data from another project
    assert r.status_code == 200
    data = r.json()
    assert "columns" in data
    assert "rows" in data
    assert "total_count" in data
    assert data["columns"] == ["host_ip", "port", "state", "service_name"]


def test_report_builder_execute_non_standard_ports(client, project_id):
    """Execute with filter: port NOT IN [80, 443] (non-standard ports)."""
    r = client.post(
        f"/api/projects/{project_id}/reports/execute",
        json={
            "definition": {
                "filters": [{"port": {"not_in": [80, 443]}}],
                "columns": ["host_ip", "port", "state"],
                "limit": 100,
                "offset": 0,
            },
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data
    # All returned rows should have port not in (80, 443) if any
    for row in data["rows"]:
        if "port" in row and row["port"] is not None:
            assert row["port"] not in (80, 443)

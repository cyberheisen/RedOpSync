"""Schemas for custom reports."""
from uuid import UUID

from pydantic import BaseModel, Field


class ReportFiltersSchema(BaseModel):
    """Report filters aligned with tree filter system."""

    exclude_unresolved: bool = True
    status: str | None = None  # "online" | "offline" | "unknown"
    subnet_id: UUID | None = None
    port_number: int | None = None
    port_protocol: str | None = None
    severity: str | None = None


class ReportRunRequest(BaseModel):
    """Request to run a report."""

    report_type: str = Field(..., description="Report type id (e.g. ips, hostnames)")
    filters: ReportFiltersSchema | None = None


class ReportConfigSchema(BaseModel):
    """Report configuration (id, name)."""

    id: str
    name: str


class ReportRunResponse(BaseModel):
    """Report execution result."""

    report_type: str
    report_name: str
    rows: list[dict]
    count: int


class ReportBuilderRequest(BaseModel):
    """Request for report builder (columns + filter)."""

    data_source: str = Field(..., description="hosts | ports | evidence | vulns")
    columns: list[str] = Field(..., description="Column IDs to include")
    filter_expression: str = Field("", description="Filter using tree filter syntax")

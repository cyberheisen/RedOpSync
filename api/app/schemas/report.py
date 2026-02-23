"""Schemas for custom reports."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ---- Report Builder (service_current) filter DSL ----

class PortFilter(BaseModel):
    """Port filter: eq, in, not_in, or range."""
    eq: int | None = None
    in_: list[int] | None = Field(None, alias="in")
    not_in: list[int] | None = None
    range_: list[int] | None = Field(None, alias="range")  # [min, max] inclusive

    model_config = {"populate_by_name": True}


class LastSeenFilter(BaseModel):
    """Last seen (timestamp) range."""
    after: datetime | str | None = None
    before: datetime | str | None = None


class ReportFilterDSL(BaseModel):
    """Single filter clause (AND semantics when combined). All fields optional."""
    port: PortFilter | int | None = None
    proto: str | None = None
    state: str | None = None
    has_http: bool | None = None
    http_status: int | None = None
    server_contains: str | None = None
    title_contains: str | None = None
    product_contains: str | None = None
    cpe_contains: str | None = None
    asn: str | None = None
    org_contains: str | None = None
    country_contains: str | None = None
    last_seen: LastSeenFilter | None = None
    tags_contains: str | None = None


class ReportSortSpec(BaseModel):
    """Sort by one column."""
    column: str
    descending: bool = False


class ReportDefinition(BaseModel):
    """Full report definition: filters, columns, sort, pagination. Stored as definition_json."""
    filters: list[ReportFilterDSL] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    sort: ReportSortSpec | None = None
    limit: int = Field(default=500, ge=1, le=10000)
    offset: int = Field(default=0, ge=0)


class ExecuteReportRequest(BaseModel):
    """Request to execute report (ad-hoc definition or reference to saved)."""
    definition: ReportDefinition


class ExecuteReportResponse(BaseModel):
    """Report execution result with pagination."""
    columns: list[str]
    rows: list[dict]
    total_count: int


class SavedReportQueryDefinition(BaseModel):
    """Stored report definition (data source, columns, filter)."""

    data_source: str
    columns: list[str]
    filter_expression: str = ""


class SavedReportCreate(BaseModel):
    """Create a saved report."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    query_definition: SavedReportQueryDefinition


class SavedReportRead(BaseModel):
    """Saved report (list/detail)."""

    id: UUID
    project_id: UUID
    name: str
    description: str | None
    query_definition: SavedReportQueryDefinition
    definition: ReportDefinition | None = None
    created_at: datetime
    updated_at: datetime | None = None
    created_by_user_id: UUID | None = None

    model_config = {"from_attributes": True}


class SavedReportCreateV2(BaseModel):
    """Create a saved report (report builder: store definition_json)."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    definition: ReportDefinition


class SavedReportUpdate(BaseModel):
    """Update a saved report."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    definition: ReportDefinition | None = None


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

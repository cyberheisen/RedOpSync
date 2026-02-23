/**
 * Report Builder (service_current) filter DSL and definition.
 * Mirrors backend Pydantic schemas.
 */

export interface PortFilter {
  eq?: number;
  in?: number[];
  not_in?: number[];
  range?: [number, number];
}

export interface LastSeenFilter {
  after?: string;
  before?: string;
}

export interface ReportFilterDSL {
  port?: PortFilter | number;
  proto?: string;
  state?: string;
  has_http?: boolean;
  http_status?: number;
  server_contains?: string;
  title_contains?: string;
  product_contains?: string;
  cpe_contains?: string;
  asn?: string;
  org_contains?: string;
  country_contains?: string;
  last_seen?: LastSeenFilter;
  tags_contains?: string;
}

export interface ReportSortSpec {
  column: string;
  descending: boolean;
}

export interface ReportDefinition {
  filters: ReportFilterDSL[];
  columns: string[];
  sort?: ReportSortSpec | null;
  limit: number;
  offset: number;
}

export interface ExecuteReportResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  total_count: number;
}

/** Built-in template: non-standard ports (not 80/443) */
export const TEMPLATE_NON_STANDARD_PORTS: ReportDefinition = {
  filters: [{ port: { not_in: [80, 443] }, state: "open" }],
  columns: ["host_ip", "port", "proto", "state", "service_name", "latest_http_title", "whois_asn"],
  sort: { column: "host_ip", descending: false },
  limit: 500,
  offset: 0,
};

/** Built-in template: port 80 with HTTP banners */
export const TEMPLATE_PORT_80_WITH_BANNERS: ReportDefinition = {
  filters: [{ port: 80, has_http: true }],
  columns: ["host_ip", "port", "state", "latest_http_title", "latest_http_server", "latest_http_status_code"],
  sort: { column: "host_ip", descending: false },
  limit: 500,
  offset: 0,
};

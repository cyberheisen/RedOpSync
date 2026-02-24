/**
 * Visual Report Builder: DSL types and field metadata.
 * Matches backend ReportDefinitionV2, ReportGroup, ReportCondition, and field registry.
 */

export type SourceId = "core" | "nmap" | "http" | "gowitness" | "whois" | "tls" | "notes";

export interface ReportCondition {
  field: string;
  operator: string;
  value?: string | number | boolean | string[] | number[] | null;
}

export interface ReportGroup {
  op: "AND" | "OR";
  children: (ReportCondition | ReportGroup)[];
}

export interface ReportColumnSpec {
  key: string;
  label?: string | null;
}

export interface ReportSortItem {
  key: string;
  direction: "asc" | "desc";
}

export interface ReportDefinitionV2 {
  sources: SourceId[];
  columns: ReportColumnSpec[];
  sort: ReportSortItem[];
  filter: ReportGroup | null;
  limit: number;
  offset: number;
}

export interface FieldMetadata {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "existence";
  source: string;
  operators_supported: string[];
}

export interface ReportingFieldsResponse {
  fields: FieldMetadata[];
}

export interface ExecuteReportResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  total_count: number;
}

export interface SavedReportItem {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  query_definition: { data_source: string; columns: string[]; filter_expression: string };
  definition?: ReportDefinitionV2 | null;
  definition_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
}

/** Default columns when no selection */
export const DEFAULT_COLUMN_KEYS = [
  "host_ip",
  "host_fqdn",
  "port",
  "proto",
  "state",
  "last_seen",
  "service_name",
  "latest_http_title",
  "whois_asn",
];

/** Quick filter templates */
export const QUICK_TEMPLATES = [
  {
    name: "Ports not 80/443",
    filter: {
      op: "AND" as const,
      children: [
        { field: "port", operator: "not_in_list", value: [80, 443] },
        { field: "state", operator: "equals", value: "open" },
      ],
    },
  },
  {
    name: "Port 80 with banners",
    filter: {
      op: "AND" as const,
      children: [
        { field: "port", operator: "equals", value: 80 },
        { field: "has_http", operator: "is_true" },
      ],
    },
  },
  {
    name: "Only risky admin ports",
    filter: {
      op: "AND" as const,
      children: [
        {
          field: "port",
          operator: "in_list",
          value: [22, 3389, 445, 1433, 3306, 6379, 9200, 5601, 8080, 8443],
        },
      ],
    },
  },
];

/** Source labels for UI */
export const SOURCE_LABELS: Record<SourceId, string> = {
  core: "Core",
  nmap: "Nmap Scan Results",
  http: "HTTP Banners",
  gowitness: "GoWitness Screenshots",
  whois: "WHOIS / ASN",
  tls: "TLS / Certificates",
  notes: "Notes / Findings",
};

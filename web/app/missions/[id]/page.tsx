"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { apiUrl, formatApiErrorDetail } from "../../lib/api";
import { useLockState } from "../../hooks/use-lock-state";
import { parseFilter, matchEvidence, matchPort, matchHost, matchVuln } from "../../lib/tree-filter";
import { AddHostModal } from "../../components/add-host-modal";
import { AddSubnetModal } from "../../components/add-subnet-modal";
import { ContextMenu } from "../../components/context-menu";
import { ImportHostsModal, type ImportHostsContext } from "../../components/import-hosts-modal";
import { NoteEditorPanel, type NoteAttachment } from "../../components/note-editor-panel";
import { NotePrintView } from "../../components/note-print-view";
import { PortModal } from "../../components/port-modal";
import { PortAttachmentsSection } from "../../components/port-attachments-section";
import { VulnerabilityModal } from "../../components/vulnerability-modal";
import { AffectedHostBadge } from "../../components/affected-host-badge";
import { ManageAffectedHostsModal } from "../../components/manage-affected-hosts-modal";
import { VulnAttachmentsSection } from "../../components/vuln-attachments-section";
import { RenameHostModal } from "../../components/rename-host-modal";
import { RenameSubnetModal } from "../../components/rename-subnet-modal";
import { StubModal } from "../../components/stub-modal";
import { CustomReportsPanel } from "../../components/custom-reports-panel";
import { ToolsDecoderPanel } from "../../components/tools-decoder-panel";
import { ToolsDiffPanel } from "../../components/tools-diff-panel";
import { ToolsDeduplicationPanel } from "../../components/tools-deduplication-panel";
import { ToolsPrettifyPanel } from "../../components/tools-prettify-panel";
import { TodosPanel } from "../../components/todos-panel";
import { AddTodoModal } from "../../components/add-todo-modal";
import { Toast } from "../../components/toast";
import { renderMarkdown } from "../../lib/markdown";
import {
  compareBySeverity,
  getEffectiveSeverity,
  getHighestSeverity,
  getSeverityColor,
  hasManualSeverityOverride,
  type SeverityLevel,
  type VulnLike,
} from "../../lib/severity";
import { Globe, TriangleAlert, Tag, CheckSquare, FileText, HelpCircle, Hash, Network, Wrench, GitCompare, ScanText, Layers, Binary, Key, Link as LinkIcon, ListFilter, Sparkles, Braces, Code, Search, Clock } from "lucide-react";

type Subnet = {
  id: string;
  project_id: string;
  cidr: string;
  name: string | null;
  in_scope?: boolean;
};

type Host = {
  id: string;
  project_id: string;
  subnet_id: string | null;
  ip: string;
  dns_name: string | null;
  status: string | null;
  whois_data?: Record<string, unknown> | null;
  in_scope?: boolean;
};

type Port = {
  id: string;
  host_id: string;
  protocol: string;
  number: number;
  state: string | null;
  service_name: string | null;
  service_version?: string | null;
  description_md?: string | null;
  evidence_md?: string | null;
  discovered_by?: string | null;
  scanned_at?: string | null;
  scan_metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

type VulnInstance = {
  id: string;
  host_id: string;
  vulnerability_definition_id: string;
  definition_title: string | null;
  definition_severity?: string | null;
  definition_cvss_score?: number | null;
  definition_description_md?: string | null;
  definition_evidence_md?: string | null;
  definition_cve_ids?: string[] | null;
  definition_discovered_by?: string | null;
  definition_created_at?: string | null;
  definition_updated_at?: string | null;
  port_id: string | null;
  status: string;
  notes_md?: string | null;
  created_at?: string;
  updated_at?: string;
};

type VulnDefinition = {
  id: string;
  project_id: string;
  title: string;
  severity: string | null;
  cvss_score: number | null;
  cve_ids: string[] | null;
  description_md: string | null;
  evidence_md: string | null;
  discovered_by: string | null;
  created_at: string;
  updated_at: string;
  instance_count: number;
  affected_host_ids: string[];
  affected_subnet_ids?: string[];
};

type NoteAttachmentDisplay = { id: string; filename: string; type: string; url: string };

type PortEvidence = {
  id: string;
  filename: string;
  caption: string | null;
  mime: string | null;
  size: number | null;
  is_pasted: boolean;
  source: string | null;
  notes_md: string | null;
  uploaded_by_username: string | null;
  created_at: string;
  imported_at?: string | null;
  source_file?: string | null;
  source_timestamp?: string | null;
};

type NoteTarget = "scope" | "subnet" | "host" | "host_ports" | "port" | "evidence" | "vulnerabilities" | "vulnerability_definition";

type Note = {
  id: string;
  host_id: string | null;
  port_id?: string | null;
  subnet_id?: string | null;
  evidence_id?: string | null;
  body_md: string | null;
  title?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_by?: string | null;
  updated_at?: string;
  attachments?: NoteAttachmentDisplay[];
  locked_by?: string | null;
  target_type?: string;
  target_id?: string | null;
};

type Mission = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  countdown_red_days_default: number;
  sort_mode?: string;
};

type ProjectTag = { id: string; project_id: string; name: string; color: string | null };
type ItemTagRecord = { id: string; tag_id: string; target_type: string; target_id: string; tag_name: string | null; tag_color: string | null };

type SelectedNode =
  | { type: "subnet"; id: string }
  | { type: "host"; id: string }
  | { type: "host-ports"; hostId: string }
  | { type: "host-whois"; hostId: string }
  | { type: "host-whois-field"; hostId: string; field: "network" | "asn" | "country" | "cidr" | "type" | "registry" }
  | { type: "port"; id: string }
  | { type: "port-evidence"; id: string; portId: string; hostId: string }
  | { type: "host-vulnerabilities"; hostId: string }
  | { type: "vuln-instance"; id: string }
  | { type: "vuln-definition"; id: string }
  | { type: "tag"; itemTagId: string; tagId: string; tagName: string; targetType: string; targetId: string; portId?: string; hostId?: string }
  | { type: "tag-filter"; tagId: string; tagName: string }
  | { type: "scope-notes" }
  | { type: "unresolved" }
  | { type: "resolved" }
  | { type: "out-of-scope" }
  | { type: "note"; id: string; target: NoteTarget; targetId: string }
  | { type: "vulnerabilities" }
  | { type: "custom-reports" }
  | { type: "report-builder" }
  | { type: "predefined-reports" }
  | { type: "saved-report"; id: string }
  | { type: "todos" }
  | { type: "tags" }
  | { type: "todo"; id: string }
  | { type: "tools-diff" }
  | { type: "tools-decoder-base" }
  | { type: "tools-decoder-xor" }
  | { type: "tools-decoder-jwt" }
  | { type: "tools-decoder-url" }
  | { type: "tools-deduplication" }
  | { type: "tools-prettify-json" }
  | { type: "tools-prettify-javascript" }
  | { type: "tool-runs" }
  | null;

const ICON = { notes: "≡" } as const;
const navIconStyle = { width: 16, height: 16, opacity: 0.9, flexShrink: 0 };

function isUnresolvedHost(h: { ip: string }): boolean {
  return String(h.ip || "").toLowerCase() === "unresolved";
}

function compareIp(a: string, b: string): number {
  const aNorm = (a || "").toLowerCase();
  const bNorm = (b || "").toLowerCase();
  if (aNorm === "unresolved") return 1;
  if (bNorm === "unresolved") return -1;
  const aParts = a.split(".").map((n) => parseInt(n, 10));
  const bParts = b.split(".").map((n) => parseInt(n, 10));
  if (aParts.length === 4 && bParts.length === 4 && !aParts.some(isNaN) && !bParts.some(isNaN)) {
    for (let i = 0; i < 4; i++) {
      const diff = aParts[i]! - bParts[i]!;
      if (diff !== 0) return diff;
    }
    return 0;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

function hostLabel(h: { ip: string; dns_name: string | null }): string {
  if (isUnresolvedHost(h) && h.dns_name) return `unresolved (${h.dns_name})`;
  if (isUnresolvedHost(h)) return "unresolved";
  return h.dns_name ? `${h.ip} (${h.dns_name})` : h.ip;
}

/** Whois "owner" from host (network/org name) for display next to subnet */
function getWhoisOwner(h: { whois_data?: Record<string, unknown> | null }): string {
  const w = h.whois_data;
  if (!w || typeof w !== "object") return "";
  const v = (w.network_name ?? w.asn_description) ?? "";
  return String(v).trim();
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

function daysRemaining(endDate: string | null): string {
  if (!endDate) return "—";
  try {
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return days > 0 ? `${days}d` : "0d";
  } catch {
    return "—";
  }
}

function Spinner() {
  return (
    <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
  );
}

function SeverityBadge({ severity, compact }: { severity: SeverityLevel | string | null | undefined; compact?: boolean }) {
  const color = getSeverityColor(severity as SeverityLevel | null | undefined);
  if (!severity) return null;
  return (
    <span
      style={{
        fontSize: compact ? 11 : 13,
        padding: compact ? "1px 6px" : "2px 8px",
        borderRadius: 4,
        backgroundColor: "var(--bg-panel)",
        border: "1px solid " + color,
        color,
      }}
    >
      {severity}
    </span>
  );
}

type ReachabilityStatus = "up" | "down" | "unknown";

function ReachabilityDot({ status }: { status: ReachabilityStatus | string | null }) {
  const norm = (status ?? "unknown").toString().toLowerCase();
  const effective: ReachabilityStatus = norm === "up" || norm === "online" ? "up" : norm === "down" || norm === "offline" ? "down" : "unknown";
  const color = effective === "up" ? "#48bb78" : effective === "down" ? "#ed8936" : "var(--text-dim)";
  const title = effective === "up" ? "Online" : effective === "down" ? "Offline" : "Unknown";
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
      title={title}
    />
  );
}

function getEffectiveHostStatus(h: { status: string | null }): ReachabilityStatus {
  const s = (h.status ?? "").toLowerCase();
  if (s === "down" || s === "offline") return "down";
  if (s === "up" || s === "online") return "up";
  return "unknown";
}

const WHOIS_FIELD_LABELS: Record<string, string> = { network: "Network", asn: "ASN", country: "Country", cidr: "CIDR", type: "Type", registry: "Registry" };
function getWhoisDisplayValue(w: Record<string, unknown> | null | undefined, field: "network" | "asn" | "country" | "cidr" | "type" | "registry"): string {
  if (!w || typeof w !== "object") return "";
  if (field === "network") return String((w.network_name ?? w.asn_description) ?? "").trim();
  if (field === "country") return [w.asn_country, w.country].filter(Boolean).map(String).join(" / ").trim();
  const key = field === "asn" ? "asn" : field === "cidr" ? "cidr" : field === "type" ? "network_type" : "asn_registry";
  const v = w[key];
  return v != null ? String(v).trim() : "";
}

const FILTER_ATTRS = [
  { attr: "ip", category: "Host", desc: "Host IP address" },
  { attr: "hostname", category: "Host", desc: "DNS name / hostname" },
  { attr: "unresolved", category: "Host", desc: "Host has unresolved IP" },
  { attr: "online", category: "Host", desc: "Host is online" },
  { attr: "status", category: "Host", desc: "Host status" },
  { attr: "whois_network", category: "Whois", desc: "Whois network name" },
  { attr: "whois_asn", category: "Whois", desc: "Whois ASN" },
  { attr: "whois_country", category: "Whois", desc: "Whois country" },
  { attr: "whois_cidr", category: "Whois", desc: "Whois CIDR" },
  { attr: "whois_type", category: "Whois", desc: "Whois network type" },
  { attr: "whois_registry", category: "Whois", desc: "Whois registry" },
  { attr: "port", category: "Port", desc: "Port number" },
  { attr: "protocol", category: "Port", desc: "Protocol (tcp, udp)" },
  { attr: "service", category: "Port", desc: "Service name" },
  { attr: "state", category: "Port", desc: "Port state" },
  { attr: "page_title", category: "Report", desc: "Page title from reports" },
  { attr: "response_code", category: "Report", desc: "HTTP response code" },
  { attr: "server", category: "Report", desc: "Server header" },
  { attr: "technology", category: "Report", desc: "Technology (from caption)" },
  { attr: "source", category: "Report", desc: "Report source (e.g. gowitness)" },
  { attr: "screenshot", category: "Report", desc: "Has screenshot (exists)" },
  { attr: "severity", category: "Vulnerability", desc: "Vuln severity (Critical, High, etc.)" },
  { attr: "vuln.title", category: "Vulnerability", desc: "Vulnerability title" },
  { attr: "cvss", category: "Vulnerability", desc: "CVSS score" },
] as const;

const FILTER_OPS: { op: string; label: string; needsValue: boolean }[] = [
  { op: "==", label: "equals", needsValue: true },
  { op: "!=", label: "not equals", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "exists", label: "exists", needsValue: false },
  { op: ">=", label: "≥", needsValue: true },
  { op: "<=", label: "≤", needsValue: true },
  { op: ">", label: ">", needsValue: true },
  { op: "<", label: "<", needsValue: true },
];

function FilterHelpPanel({
  onClose,
  currentFilter,
  onApplyFilter,
  parseFilter,
}: {
  onClose: () => void;
  currentFilter: string;
  onApplyFilter: (v: string) => void;
  parseFilter: (input: string) => { attr: string; op: string; value?: string | number | boolean } | null;
}) {
  const [builderAttr, setBuilderAttr] = useState("page_title");
  const [builderOp, setBuilderOp] = useState("contains");
  const [builderValue, setBuilderValue] = useState("");
  const parsed = parseFilter(currentFilter);

  const buildExpression = () => {
    const attr = builderAttr;
    const op = builderOp;
    const needsVal = FILTER_OPS.find((o) => o.op === op)?.needsValue ?? true;
    if (needsVal && op !== "exists") {
      const val = builderValue.trim();
      if (!val) return "";
      const isNum = /^\d+(\.\d+)?$/.test(val);
      const isBool = val === "true" || val === "false";
      const isSeverity = ["Critical", "High", "Medium", "Low", "Info"].includes(val);
      const noQuotes = isNum || isBool || isSeverity;
      const quote = !noQuotes ? '"' : "";
      return `${attr} ${op} ${quote}${val}${quote}`.trim();
    }
    return `${attr} exists`;
  };

  const handleApply = () => {
    onApplyFilter(buildExpression());
  };

  return (
    <aside
      style={{
        width: 340,
        minWidth: 340,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        backgroundColor: "var(--bg-panel)",
        overflowY: "auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Filter help</h3>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", padding: "0 4px", lineHeight: 1 }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <section>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>Syntax</h4>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--text)" }}>
          Use <code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>attr op value</code>. Values with spaces use quotes. Matching is case-insensitive.
        </p>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
          <li><code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>==</code> equals</li>
          <li><code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>!=</code> not equals</li>
          <li><code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>contains</code> substring match</li>
          <li><code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>exists</code> attribute present (no value)</li>
          <li><code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>&gt;=</code> <code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>&lt;=</code> <code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>&gt;</code> <code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 4 }}>&lt;</code> for numbers and severity</li>
        </ul>
      </section>

      <section>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>Examples</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
          {[
            "page_title contains login",
            "response_code == 200",
            "service == https",
            "severity >= High",
            "screenshot exists",
            "port >= 443",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              className="theme-btn theme-btn-ghost"
              style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace", padding: "6px 8px" }}
              onClick={() => onApplyFilter(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>Filter builder</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Attribute</label>
            <select
              className="theme-input"
              value={builderAttr}
              onChange={(e) => setBuilderAttr(e.target.value)}
              style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
            >
              {FILTER_ATTRS.map((a) => (
                <option key={a.attr} value={a.attr}>{a.attr} ({a.category})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Operator</label>
            <select
              className="theme-input"
              value={builderOp}
              onChange={(e) => {
                setBuilderOp(e.target.value);
                if (e.target.value === "exists") setBuilderValue("");
              }}
              style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
            >
              {FILTER_OPS.map((o) => (
                <option key={o.op} value={o.op}>{o.label}</option>
              ))}
            </select>
          </div>
          {FILTER_OPS.find((o) => o.op === builderOp)?.needsValue !== false && (
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Value</label>
              <input
                type="text"
                className="theme-input"
                value={builderValue}
                onChange={(e) => setBuilderValue(e.target.value)}
                placeholder={builderAttr === "severity" ? "Critical, High, Medium, Low, Info" : "Enter value"}
                style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
              />
            </div>
          )}
          <button
            type="button"
            className="theme-btn"
            onClick={handleApply}
            disabled={!buildExpression()}
            style={{ marginTop: 4 }}
          >
            Apply filter
          </button>
          {buildExpression() && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
              → {buildExpression()}
            </div>
          )}
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>Attributes</h4>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--text)" }}>
          {["Host", "Port", "Report", "Vulnerability"].map((cat) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{cat}:</span>{" "}
              {FILTER_ATTRS.filter((a) => a.category === cat).map((a) => a.attr).join(", ")}
            </div>
          ))}
        </div>
      </section>

      {currentFilter && (
        <section>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>Current filter</h4>
          <div style={{ fontSize: 12, fontFamily: "monospace", wordBreak: "break-all", color: parsed ? "var(--accent)" : "var(--text-dim)" }}>
            {currentFilter}
            {parsed && ` ✓`}
          </div>
        </section>
      )}
    </aside>
  );
}

function SavedReportRunView({
  projectId,
  report,
  onToast,
}: {
  projectId: string;
  report: { id: string; name: string; description: string | null; query_definition: { data_source: string; columns: string[]; filter_expression: string } };
  onToast?: (msg: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const runReport = () => {
    setLoading(true);
    fetch(apiUrl(`/api/projects/${projectId}/reports/saved/${report.id}/run`), {
      method: "POST",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Run failed"))))
      .then((data: { rows?: Record<string, unknown>[] }) => {
        setRows(data.rows ?? []);
        onToast?.("Report run complete");
      })
      .catch(() => onToast?.("Run failed"))
      .finally(() => setLoading(false));
  };
  const exportCsv = () => {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]!);
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = keys.map(escape).join(",");
    const lines = rows.map((r) => keys.map((k) => escape(r[k])).join(","));
    const content = [header, ...lines].join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast?.("CSV downloaded");
  };
  const exportJson = () => {
    const content = JSON.stringify(rows, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast?.("JSON downloaded");
  };
  const keys = rows.length > 0 ? Object.keys(rows[0]!) : [];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{report.name}</h2>
      {report.description && <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{report.description}</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className="theme-btn theme-btn-primary" onClick={runReport} disabled={loading}>
          {loading ? "Running…" : "Run report"}
        </button>
        {rows.length > 0 && (
          <>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={exportCsv}>Export CSV</button>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={exportJson}>Export JSON</button>
          </>
        )}
      </div>
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {keys.map((k) => (
                  <th key={k} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>{String(r[k] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>Showing first 500 of {rows.length} rows.</p>}
        </div>
      )}
    </div>
  );
}

export default function MissionDetailPage() {
  const params = useParams();
  const missionId = params.id as string;
  const [mission, setMission] = useState<Mission | null>(null);
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [portsByHost, setPortsByHost] = useState<Record<string, Port[]>>({});
  const [vulnsByHost, setVulnsByHost] = useState<Record<string, VulnInstance[]>>({});
  const [notesByHost, setNotesByHost] = useState<Record<string, Note[]>>({});
  const [notesByPort, setNotesByPort] = useState<Record<string, Note[]>>({});
  const [scopeNotes, setScopeNotes] = useState<Note[]>([]);
  const [notesBySubnet, setNotesBySubnet] = useState<Record<string, Note[]>>({});
  const [notesBySubnetLoaded, setNotesBySubnetLoaded] = useState<Set<string>>(new Set());
  const [notesBySubnetLoading, setNotesBySubnetLoading] = useState<Set<string>>(new Set());
  const [notesByEvidence, setNotesByEvidence] = useState<Record<string, Note[]>>({});
  const [notesByEvidenceLoaded, setNotesByEvidenceLoaded] = useState<Set<string>>(new Set());
  const [notesByEvidenceLoading, setNotesByEvidenceLoading] = useState<Set<string>>(new Set());
  const [portsLoaded, setPortsLoaded] = useState<Set<string>>(new Set());
  const [evidenceByPort, setEvidenceByPort] = useState<Record<string, PortEvidence[]>>({});
  const [evidenceLoaded, setEvidenceLoaded] = useState<Set<string>>(new Set());
  const [evidenceLoading, setEvidenceLoading] = useState<Set<string>>(new Set());
  const [vulnsLoaded, setVulnsLoaded] = useState<Set<string>>(new Set());
  const [notesLoaded, setNotesLoaded] = useState<Set<string>>(new Set());
  const [notesByPortLoaded, setNotesByPortLoaded] = useState<Set<string>>(new Set());
  const [notesByPortLoading, setNotesByPortLoading] = useState<Set<string>>(new Set());
  const [scopeNotesLoaded, setScopeNotesLoaded] = useState(false);
  const [portsLoading, setPortsLoading] = useState<Set<string>>(new Set());
  const [vulnsLoading, setVulnsLoading] = useState<Set<string>>(new Set());
  const [notesLoading, setNotesLoading] = useState<Set<string>>(new Set());
  const [scopeNotesLoading, setScopeNotesLoading] = useState(false);
  const [projectNotes, setProjectNotes] = useState<Note[]>([]);
  const [notesVersion, setNotesVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lockError, setLockError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: { label: string; onClick: () => void }[] } | null>(null);
  const [importHostsModal, setImportHostsModal] = useState<ImportHostsContext | null>(null);
  const [addSubnetModal, setAddSubnetModal] = useState(false);
  const [addHostModal, setAddHostModal] = useState<{ subnetId: string | null } | null>(null);
  const [renameSubnetModal, setRenameSubnetModal] = useState<Subnet | null>(null);
  const [renameHostModal, setRenameHostModal] = useState<Host | null>(null);
  const [noteModal, setNoteModal] = useState<{
    mode: "add" | "edit";
    target: NoteTarget;
    host?: Host;
    port?: Port;
    subnet?: Subnet;
    evidence?: PortEvidence;
    definition?: VulnDefinition;
    note?: Note;
  } | null>(null);
  const [notePrintView, setNotePrintView] = useState<{ note: Note; target: NoteTarget; host?: Host; port?: Port; subnet?: Subnet; evidence?: PortEvidence; definition?: VulnDefinition } | null>(null);
  const [deleteNoteModal, setDeleteNoteModal] = useState<{ note: Note; target: NoteTarget; host?: Host; port?: Port; subnet?: Subnet; evidence?: PortEvidence; definition?: VulnDefinition } | null>(null);
  const [portModal, setPortModal] = useState<{ mode: "add" | "edit"; host: Host; port?: Port } | null>(null);
  const [deletePortModal, setDeletePortModal] = useState<{ port: Port; host: Host } | null>(null);
  const [deleteHostModal, setDeleteHostModal] = useState<Host | null>(null);
  const [deleteSubnetModal, setDeleteSubnetModal] = useState<Subnet | null>(null);
  const [vulnDefinitions, setVulnDefinitions] = useState<VulnDefinition[]>([]);
  const [vulnDefinitionsLoaded, setVulnDefinitionsLoaded] = useState(false);
  const [vulnDefinitionsLoading, setVulnDefinitionsLoading] = useState(false);
  const [vulnModal, setVulnModal] = useState<{ mode: "add" | "edit"; host?: Host; vuln?: VulnInstance; definition?: VulnDefinition } | null>(null);
  const [manageAffectedHostsModal, setManageAffectedHostsModal] = useState<VulnDefinition | null>(null);
  const [deleteVulnModal, setDeleteVulnModal] = useState<{ instance: VulnInstance } | null>(null);
  const [stubModal, setStubModal] = useState<{ title: string; message?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<{ id: string; project_id: string; name: string; description: string | null; query_definition: { data_source: string; columns: string[]; filter_expression: string }; created_at: string }[]>([]);
  const [toolRunsEvents, setToolRunsEvents] = useState<{ id: string; timestamp: string; action_type: string; tool: string; details: Record<string, unknown> }[]>([]);
  const [toolRunsLoading, setToolRunsLoading] = useState(false);
  type TodoParentType = "scope" | "subnet" | "host" | "host_ports" | "port" | "vulnerabilities" | "vulnerability_definition";
  const [addTodoModal, setAddTodoModal] = useState<{ parentType: TodoParentType; parentId?: string | null; contextLabel?: string } | null>(null);
  const [todosVersion, setTodosVersion] = useState(0);
  type ProjectTodo = { id: string; project_id: string; title: string; description: string | null; status: string; subnet_id: string | null; host_id: string | null; port_id: string | null; assigned_to_user_id: string | null; assigned_to_username: string | null; target_type: string; target_id: string | null; created_at: string; updated_at: string };
  const [projectTodos, setProjectTodos] = useState<ProjectTodo[]>([]);
  type UserOption = { id: string; username: string; role: string };
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [itemTags, setItemTags] = useState<ItemTagRecord[]>([]);
  const [tagsVersion, setTagsVersion] = useState(0);
  const [addTagModal, setAddTagModal] = useState<{ targetType: string; targetId: string; portId?: string; hostId?: string } | null>(null);
  const [createTagModal, setCreateTagModal] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState("");
  const [createTagSaving, setCreateTagSaving] = useState(false);

  const TREE_WIDTH_KEY = "redopsync-tree-width";
  const defaultTreeWidth = 280;
  const [treeFilterInput, setTreeFilterInput] = useState("");
  const [filterHelpOpen, setFilterHelpOpen] = useState(false);
  const [activeTagFilterState, setActiveTagFilterState] = useState<{ tagId: string; tagName: string } | null>(null);
  const [treeWidth, setTreeWidthState] = useState(defaultTreeWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TREE_WIDTH_KEY);
      if (stored != null) {
        const w = parseInt(stored, 10);
        if (!Number.isNaN(w) && w >= 220) setTreeWidthState(w);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setTreeWidth = useCallback((w: number) => {
    const minW = 220;
    const maxW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.5) : 600;
    const clamped = Math.min(maxW, Math.max(minW, w));
    setTreeWidthState(clamped);
    try {
      localStorage.setItem(TREE_WIDTH_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const maxW = Math.floor(rect.width * 0.5);
      const clamped = Math.min(maxW, Math.max(220, x));
      setTreeWidthState(clamped);
      try {
        localStorage.setItem(TREE_WIDTH_KEY, String(clamped));
      } catch {
        /* ignore */
      }
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const { locks, acquireLock, releaseLock, renewLock, refreshLocks } = useLockState(missionId);

  const loadEvidenceForPort = useCallback((portId: string) => {
    if (evidenceLoaded.has(portId) || evidenceLoading.has(portId)) return;
    setEvidenceLoading((p) => new Set(p).add(portId));
    fetch(apiUrl(`/api/ports/${portId}/attachments`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((atts: PortEvidence[]) => {
        setEvidenceByPort((prev) => ({ ...prev, [portId]: atts ?? [] }));
        setEvidenceLoaded((p) => new Set(p).add(portId));
      })
      .finally(() => setEvidenceLoading((p) => { const n = new Set(p); n.delete(portId); return n; }));
  }, [evidenceLoaded, evidenceLoading]);

  const loadPortsForHost = useCallback((hostId: string, sortMode?: string) => {
    if (portsLoaded.has(hostId) || portsLoading.has(hostId)) return;
    setPortsLoading((p) => new Set(p).add(hostId));
    const sortQ = sortMode ? `&sort_mode=${encodeURIComponent(sortMode)}` : "";
    fetch(apiUrl(`/api/ports?host_id=${hostId}${sortQ}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((ports: Port[]) => {
        setPortsByHost((prev) => ({ ...prev, [hostId]: ports }));
        setPortsLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setPortsLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [portsLoaded, portsLoading]);

  const loadVulnsForHost = useCallback((hostId: string) => {
    if (vulnsLoaded.has(hostId) || vulnsLoading.has(hostId)) return;
    setVulnsLoading((p) => new Set(p).add(hostId));
    fetch(apiUrl(`/api/vulnerability-instances?host_id=${hostId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((vulns: VulnInstance[]) => {
        setVulnsByHost((prev) => ({ ...prev, [hostId]: vulns }));
        setVulnsLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setVulnsLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [vulnsLoaded, vulnsLoading]);

  const loadNotesForHost = useCallback((hostId: string) => {
    if (notesLoaded.has(hostId) || notesLoading.has(hostId)) return;
    setNotesLoading((p) => new Set(p).add(hostId));
    fetch(apiUrl(`/api/notes?host_id=${hostId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; host_id: string | null; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw.map((n) => ({
          ...n,
          title: null,
          created_by: "Unknown",
          created_at: n.created_at ?? new Date().toISOString(),
          updated_by: "Unknown",
          updated_at: n.updated_at ?? n.created_at ?? new Date().toISOString(),
          attachments: [],
        }));
        setNotesByHost((prev) => ({ ...prev, [hostId]: notes }));
        setNotesLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setNotesLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [notesLoaded, notesLoading]);

  const loadNotesForPort = useCallback((portId: string) => {
    if (notesByPortLoaded.has(portId) || notesByPortLoading.has(portId)) return;
    setNotesByPortLoading((p) => new Set(p).add(portId));
    fetch(apiUrl(`/api/notes?project_id=${missionId}&port_id=${portId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; port_id: string | null; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw.map((n) => ({
          ...n,
          title: null,
          created_by: "Unknown",
          created_at: n.created_at ?? new Date().toISOString(),
          updated_by: "Unknown",
          updated_at: (n as { updated_at?: string }).updated_at ?? n.created_at ?? new Date().toISOString(),
          attachments: [],
        }));
        setNotesByPort((prev) => ({ ...prev, [portId]: notes }));
        setNotesByPortLoaded((p) => new Set(p).add(portId));
      })
      .finally(() => setNotesByPortLoading((p) => { const n = new Set(p); n.delete(portId); return n; }));
  }, [missionId, notesByPortLoaded, notesByPortLoading]);

  const loadScopeNotes = useCallback(() => {
    if (scopeNotesLoaded || scopeNotesLoading) return;
    setScopeNotesLoading(true);
    fetch(apiUrl(`/api/notes?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; host_id: string | null; subnet_id: string | null; port_id: string | null; evidence_id: string | null; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw
          .filter((n) => !n.host_id && !n.subnet_id && !n.port_id && !n.evidence_id)
          .map((n) => ({
            ...n,
            title: null,
            created_by: "Unknown",
            created_at: n.created_at ?? new Date().toISOString(),
            updated_by: "Unknown",
            updated_at: (n as { updated_at?: string }).updated_at ?? n.created_at ?? new Date().toISOString(),
            attachments: [],
          }));
        setScopeNotes(notes);
        setScopeNotesLoaded(true);
      })
      .finally(() => setScopeNotesLoading(false));
  }, [missionId, scopeNotesLoaded, scopeNotesLoading]);

  const loadNotesForSubnet = useCallback((subnetId: string) => {
    if (notesBySubnetLoaded.has(subnetId) || notesBySubnetLoading.has(subnetId)) return;
    setNotesBySubnetLoading((p) => new Set(p).add(subnetId));
    fetch(apiUrl(`/api/notes?project_id=${missionId}&subnet_id=${subnetId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw.map((n) => ({
          ...n,
          title: null,
          created_by: "Unknown",
          created_at: n.created_at ?? new Date().toISOString(),
          updated_by: "Unknown",
          updated_at: (n as { updated_at?: string }).updated_at ?? n.created_at ?? new Date().toISOString(),
          attachments: [],
        }));
        setNotesBySubnet((prev) => ({ ...prev, [subnetId]: notes }));
        setNotesBySubnetLoaded((p) => new Set(p).add(subnetId));
      })
      .finally(() => setNotesBySubnetLoading((p) => { const n = new Set(p); n.delete(subnetId); return n; }));
  }, [missionId, notesBySubnetLoaded, notesBySubnetLoading]);

  const loadNotesForEvidence = useCallback((evidenceId: string) => {
    if (notesByEvidenceLoaded.has(evidenceId) || notesByEvidenceLoading.has(evidenceId)) return;
    setNotesByEvidenceLoading((p) => new Set(p).add(evidenceId));
    fetch(apiUrl(`/api/notes?project_id=${missionId}&evidence_id=${evidenceId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw.map((n) => ({
          ...n,
          title: null,
          created_by: "Unknown",
          created_at: n.created_at ?? new Date().toISOString(),
          updated_by: "Unknown",
          updated_at: (n as { updated_at?: string }).updated_at ?? n.created_at ?? new Date().toISOString(),
          attachments: [],
        }));
        setNotesByEvidence((prev) => ({ ...prev, [evidenceId]: notes }));
        setNotesByEvidenceLoaded((p) => new Set(p).add(evidenceId));
      })
      .finally(() => setNotesByEvidenceLoading((p) => { const n = new Set(p); n.delete(evidenceId); return n; }));
  }, [missionId, notesByEvidenceLoaded, notesByEvidenceLoading]);

  const loadProjectNotes = useCallback(() => {
    if (!missionId) return;
    fetch(apiUrl(`/api/notes?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; target_type?: string; target_id?: string | null; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw.map((n) => ({
          ...n,
          target_type: n.target_type ?? "scope",
          target_id: n.target_id ?? null,
          title: null,
          created_by: "Unknown",
          created_at: n.created_at ?? new Date().toISOString(),
          updated_by: "Unknown",
          updated_at: (n as { updated_at?: string }).updated_at ?? n.created_at ?? new Date().toISOString(),
          attachments: [],
        }));
        setProjectNotes(notes);
      })
      .catch(() => setProjectNotes([]));
  }, [missionId]);

  useEffect(() => {
    if (missionId) loadProjectNotes();
  }, [missionId, loadProjectNotes, notesVersion]);

  const loadVulnDefinitions = useCallback(() => {
    if (vulnDefinitionsLoaded || vulnDefinitionsLoading) return;
    setVulnDefinitionsLoading(true);
    fetch(apiUrl(`/api/vulnerability-definitions?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((defs: VulnDefinition[]) => {
        setVulnDefinitions(defs);
        setVulnDefinitionsLoaded(true);
      })
      .finally(() => setVulnDefinitionsLoading(false));
  }, [missionId, vulnDefinitionsLoaded, vulnDefinitionsLoading]);

  const refreshVulnDefinitions = useCallback(() => {
    setVulnDefinitionsLoading(true);
    fetch(apiUrl(`/api/vulnerability-definitions?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((defs: VulnDefinition[]) => {
        setVulnDefinitions(defs);
        setVulnDefinitionsLoaded(true);
      })
      .finally(() => setVulnDefinitionsLoading(false));
  }, [missionId]);

  const loadData = useCallback(() => {
    setSelectedNode(null);
    setPortsByHost({});
    setEvidenceByPort({});
    setEvidenceLoaded(new Set());
    setVulnsByHost({});
    setNotesByHost({});
    setNotesByPort({});
    setScopeNotes([]);
    setNotesBySubnet({});
    setNotesBySubnetLoaded(new Set());
    setVulnDefinitions([]);
    setVulnDefinitionsLoaded(false);
    setPortsLoaded(new Set());
    setVulnsLoaded(new Set());
    setNotesLoaded(new Set());
    setNotesByPortLoaded(new Set());
    setScopeNotesLoaded(false);
    fetch(apiUrl(`/api/projects/${missionId}`), { credentials: "include" })
      .then((projRes) => {
        if (!projRes.ok) throw new Error("Mission not found");
        return projRes.json();
      })
      .then((proj) => {
        const mode = proj.sort_mode || "cidr_asc";
        const sortQ = `&sort_mode=${encodeURIComponent(mode)}`;
        setMission(proj);
        return Promise.all([
          fetch(apiUrl(`/api/subnets?project_id=${missionId}${sortQ}`), { credentials: "include" }),
          fetch(apiUrl(`/api/hosts?project_id=${missionId}${sortQ}`), { credentials: "include" }),
        ]).then(async ([subnetsRes, hostsRes]) => {
          if (!subnetsRes.ok) throw new Error("Failed to load subnets");
          if (!hostsRes.ok) throw new Error("Failed to load hosts");
          const [subnetList, hostList] = await Promise.all([subnetsRes.json(), hostsRes.json()]);
          setSubnets(subnetList);
          setHosts(hostList);
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [missionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadSavedReports = useCallback(() => {
    if (!missionId) return;
    fetch(apiUrl(`/api/projects/${missionId}/reports/saved`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => setSavedReports(Array.isArray(list) ? list : []))
      .catch(() => setSavedReports([]));
  }, [missionId]);

  useEffect(() => {
    if (missionId) loadSavedReports();
  }, [missionId, loadSavedReports]);

  const loadProjectTodos = useCallback(() => {
    if (!missionId) return;
    fetch(apiUrl(`/api/todos?project_id=${missionId}&status=all`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => setProjectTodos(Array.isArray(list) ? list : []))
      .catch(() => setProjectTodos([]));
  }, [missionId]);

  useEffect(() => {
    if (missionId) loadProjectTodos();
  }, [missionId, loadProjectTodos, todosVersion]);

  const loadTagsAndItemTags = useCallback(() => {
    if (!missionId) return;
    Promise.all([
      fetch(apiUrl(`/api/projects/${missionId}/tags`), { credentials: "include" }),
      fetch(apiUrl(`/api/projects/${missionId}/item-tags`), { credentials: "include" }),
    ])
      .then(async ([tagsRes, itemTagsRes]) => {
        const tags = tagsRes.ok ? (await tagsRes.json()) : [];
        const itemTagsList = itemTagsRes.ok ? (await itemTagsRes.json()) : [];
        setProjectTags(Array.isArray(tags) ? tags : []);
        setItemTags(Array.isArray(itemTagsList) ? itemTagsList : []);
      })
      .catch(() => {
        setProjectTags([]);
        setItemTags([]);
      });
  }, [missionId]);

  useEffect(() => {
    if (missionId) loadTagsAndItemTags();
  }, [missionId, loadTagsAndItemTags, tagsVersion]);

  useEffect(() => {
    fetch(apiUrl("/api/auth/users"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (mission && !vulnDefinitionsLoaded && !vulnDefinitionsLoading) {
      loadVulnDefinitions();
    }
  }, [mission, vulnDefinitionsLoaded, vulnDefinitionsLoading, loadVulnDefinitions]);

  const loadPortsAndVulnsForProject = useCallback(() => {
    if (!missionId || !mission) return;
    const sortMode = mission.sort_mode || "cidr_asc";
    const sortQ = `&sort_mode=${encodeURIComponent(sortMode)}`;
    Promise.all([
      fetch(apiUrl(`/api/ports?project_id=${missionId}${sortQ}`), { credentials: "include" }),
      fetch(apiUrl(`/api/vulnerability-instances?project_id=${missionId}`), { credentials: "include" }),
    ])
      .then(async ([portsRes, vulnsRes]) => {
        const portsList: Port[] = portsRes.ok ? await portsRes.json() : [];
        const vulnsList: VulnInstance[] = vulnsRes.ok ? await vulnsRes.json() : [];
        const portsByHostNext: Record<string, Port[]> = {};
        const vulnsByHostNext: Record<string, VulnInstance[]> = {};
        for (const p of portsList) {
          const hid = p.host_id;
          if (!portsByHostNext[hid]) portsByHostNext[hid] = [];
          portsByHostNext[hid].push(p);
        }
        for (const v of vulnsList) {
          const hid = v.host_id;
          if (!vulnsByHostNext[hid]) vulnsByHostNext[hid] = [];
          vulnsByHostNext[hid].push(v);
        }
        setPortsByHost((prev) => ({ ...prev, ...portsByHostNext }));
        setVulnsByHost((prev) => ({ ...prev, ...vulnsByHostNext }));
        const allHostIdsFromPorts = new Set(portsList.map((p) => p.host_id));
        const allHostIdsFromVulns = new Set(vulnsList.map((v) => v.host_id));
        const allIds = new Set([...allHostIdsFromPorts, ...allHostIdsFromVulns, ...hosts.map((h) => h.id)]);
        setPortsLoaded((prev) => new Set([...prev, ...allIds]));
        setVulnsLoaded((prev) => new Set([...prev, ...allIds]));
      })
      .catch(() => {});
  }, [missionId, mission, hosts]);

  useEffect(() => {
    if (!mission || hosts.length === 0) return;
    loadPortsAndVulnsForProject();
  }, [mission?.id, mission?.sort_mode, hosts.length, loadPortsAndVulnsForProject]);

  const selectedHost =
    selectedNode?.type === "host" || selectedNode?.type === "host-ports" || selectedNode?.type === "host-whois" || selectedNode?.type === "host-whois-field" || selectedNode?.type === "host-vulnerabilities" || (selectedNode?.type === "note" && selectedNode.target === "host")
      ? hosts.find((h) =>
          selectedNode!.type === "note"
            ? selectedNode.targetId === h.id
            : selectedNode!.type === "host"
              ? selectedNode.id === h.id
              : selectedNode!.hostId === h.id
        ) ?? null
      : null;

  useEffect(() => {
    if (selectedHost) refreshLocks();
  }, [selectedHost, refreshLocks]);

  const itemTagsByTarget = useMemo(() => {
    const map: Record<string, ItemTagRecord[]> = {};
    for (const it of itemTags) {
      const key = `${it.target_type}:${it.target_id}`;
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [itemTags]);

  /** Host IDs that have a given tag (for tag-filter in tree). */
  const hostIdsByTagId = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const it of itemTags) {
      if (it.target_type !== "host") continue;
      if (!map[it.tag_id]) map[it.tag_id] = new Set();
      map[it.tag_id].add(it.target_id);
    }
    return map;
  }, [itemTags]);

  const getItemTagsFor = useCallback(
    (targetType: string, targetId: string) => itemTagsByTarget[`${targetType}:${targetId}`] ?? [],
    [itemTagsByTarget]
  );

  const handleAddItemTag = useCallback(
    (tagId: string, targetType: string, targetId: string) => {
      if (!missionId) return;
      fetch(apiUrl(`/api/projects/${missionId}/item-tags`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: tagId, target_type: targetType, target_id: targetId }),
      })
        .then((r) => {
          if (r.ok) {
            setTagsVersion((v) => v + 1);
            setAddTagModal(null);
          } else return r.json().then((d) => Promise.reject(d));
        })
        .catch((err) => setToast(formatApiErrorDetail(err?.detail ?? err, "Failed to add tag")));
    },
    [missionId]
  );

  const handleRemoveItemTag = useCallback(
    (itemTagId: string) => {
      if (!missionId) return;
      fetch(apiUrl(`/api/projects/${missionId}/item-tags/${itemTagId}`), { method: "DELETE", credentials: "include" })
        .then((r) => {
          if (r.ok) {
            setTagsVersion((v) => v + 1);
            setContextMenu(null);
            setSelectedNode(null);
          } else return r.json().then((d) => Promise.reject(d));
        })
        .catch((err) => setToast(formatApiErrorDetail(err?.detail ?? err, "Failed to remove tag")));
    },
    [missionId]
  );

  const toggleExpand = (key: string, onExpand?: () => void) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const isExpanding = !next.has(key);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (isExpanding && onExpand) onExpand();
      return next;
    });
  };

  const hostsBySubnet = useMemo(() => {
    const acc: Record<string, Host[]> = {};
    for (const h of hosts) {
      if (isUnresolvedHost(h)) {
        const k = "_unresolved";
        if (!acc[k]) acc[k] = [];
        acc[k].push(h);
      } else {
        const k = h.subnet_id ?? "_unassigned";
        if (!acc[k]) acc[k] = [];
        acc[k].push(h);
      }
    }
    for (const k of Object.keys(acc)) {
      acc[k]!.sort((a, b) => compareIp(a.ip, b.ip));
    }
    return acc;
  }, [hosts]);

  const inScopeSubnets = useMemo(() => subnets.filter((s) => s.in_scope !== false), [subnets]);
  const outOfScopeSubnets = useMemo(() => subnets.filter((s) => s.in_scope === false), [subnets]);
  const standaloneOutOfScopeHosts = useMemo(
    () =>
      hosts.filter(
        (h) =>
          h.in_scope === false &&
          (h.subnet_id == null || subnets.find((s) => s.id === h.subnet_id)?.in_scope !== false)
      ),
    [hosts, subnets]
  );

  /** In-scope resolved host count (hosts under subnets + unassigned), used for Resolved node label. */
  const inScopeResolvedHostCount = useMemo(
    () =>
      inScopeSubnets.reduce(
        (n, s) => n + (hostsBySubnet[s.id] ?? []).filter((h) => h.in_scope !== false).length,
        0
      ) + (hostsBySubnet["_unassigned"] ?? []).filter((h) => h.in_scope !== false).length,
    [inScopeSubnets, hostsBySubnet]
  );

  const getDescendantKeys = useCallback((key: string): Set<string> => {
    const out = new Set<string>([key]);
    if (key === "scope") {
      out.add("resolved");
      inScopeSubnets.forEach((s) => out.add(`subnet:${s.id}`));
      out.add("unresolved");
      hosts.filter((h) => h.in_scope !== false).forEach((h) => {
        out.add(`host:${h.id}`);
        out.add(`host-ports:${h.id}`);
        out.add(`host-vulns:${h.id}`);
        (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      });
      out.add("out-of-scope");
      outOfScopeSubnets.forEach((s) => {
        out.add(`subnet:${s.id}`);
        (hostsBySubnet[s.id] ?? []).forEach((h) => {
          out.add(`host:${h.id}`);
          out.add(`host-ports:${h.id}`);
          out.add(`host-vulns:${h.id}`);
          (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
        });
      });
      standaloneOutOfScopeHosts.forEach((h) => {
        out.add(`host:${h.id}`);
        out.add(`host-ports:${h.id}`);
        out.add(`host-vulns:${h.id}`);
        (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      });
      return out;
    }
    if (key === "resolved") {
      inScopeSubnets.forEach((s) => out.add(`subnet:${s.id}`));
      (hostsBySubnet["_unassigned"] ?? []).filter((h) => h.in_scope !== false).forEach((h) => {
        out.add(`host:${h.id}`);
        out.add(`host-ports:${h.id}`);
        out.add(`host-vulns:${h.id}`);
        (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      });
      inScopeSubnets.forEach((s) => {
        (hostsBySubnet[s.id] ?? []).filter((h) => h.in_scope !== false).forEach((h) => {
          out.add(`host:${h.id}`);
          out.add(`host-ports:${h.id}`);
          out.add(`host-vulns:${h.id}`);
          (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
        });
      });
      return out;
    }
    if (key === "out-of-scope") {
      outOfScopeSubnets.forEach((s) => {
        out.add(`subnet:${s.id}`);
        (hostsBySubnet[s.id] ?? []).forEach((h) => {
          out.add(`host:${h.id}`);
          out.add(`host-ports:${h.id}`);
          out.add(`host-vulns:${h.id}`);
          (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
        });
      });
      standaloneOutOfScopeHosts.forEach((h) => {
        out.add(`host:${h.id}`);
        out.add(`host-ports:${h.id}`);
        out.add(`host-vulns:${h.id}`);
        (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      });
      return out;
    }
    if (key === "unresolved") {
      (hostsBySubnet["_unresolved"] ?? []).forEach((h) => {
        out.add(`host:${h.id}`);
        out.add(`host-ports:${h.id}`);
        out.add(`host-vulns:${h.id}`);
        (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      });
      return out;
    }
    if (key.startsWith("subnet:")) {
      const sid = key.slice(7);
      (hostsBySubnet[sid] ?? []).forEach((h) => {
        out.add(`host:${h.id}`);
        out.add(`host-ports:${h.id}`);
        out.add(`host-vulns:${h.id}`);
        (portsByHost[h.id] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      });
      return out;
    }
    if (key.startsWith("host:")) {
      const hid = key.slice(5);
      out.add(`host-ports:${hid}`);
      out.add(`host-vulns:${hid}`);
      (portsByHost[hid] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      return out;
    }
    if (key.startsWith("host-ports:")) {
      const hid = key.slice(11);
      (portsByHost[hid] ?? []).forEach((p) => out.add(`port-evidence:${p.id}`));
      return out;
    }
    if (key === "host-vulns:" || key.startsWith("host-vulns:") || key.startsWith("port-evidence:") || key === "vulnerabilities") return out;
    if (key === "tools") {
      out.add("tools-decoder");
      out.add("tools-prettify");
      return out;
    }
    return out;
  }, [subnets, hosts, hostsBySubnet, portsByHost, inScopeSubnets, outOfScopeSubnets, standaloneOutOfScopeHosts]);

  const toggleExpandCollapse = useCallback((key: string) => {
    const keys = getDescendantKeys(key);
    setExpanded((prev) => {
      const allExpanded = [...keys].every((k) => prev.has(k));
      if (allExpanded) {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      }
      return new Set([...prev, ...keys]);
    });
  }, [getDescendantKeys]);

  const toggleExpandCollapseAll = useCallback(() => {
    setExpanded((prev) => {
      const allKeys = new Set([
        ...getDescendantKeys("scope"),
        ...getDescendantKeys("vulnerabilities"),
        ...getDescendantKeys("todos-root"),
        ...getDescendantKeys("tags-root"),
        ...getDescendantKeys("custom-reports"),
        ...getDescendantKeys("tools"),
      ]);
      const allExpanded = [...allKeys].every((k) => prev.has(k));
      if (allExpanded) return new Set();
      return new Set([...prev, ...allKeys]);
    });
  }, [getDescendantKeys]);

  const parsedFilter = useMemo(() => parseFilter(treeFilterInput), [treeFilterInput]);
  const filterActive = !!parsedFilter && treeFilterInput.trim().length > 0;

  const { matchingHostIds, matchingPortIds, matchingSubnetIds, matchingVulnIds, hasMatchingUnresolved, matchingUnassignedHostIds, visibleHostCount } = useMemo(() => {
    const hostIds = new Set<string>();
    const portIds = new Set<string>();
    const subnetIds = new Set<string>();
    const vulnIds = new Set<string>();
    if (!parsedFilter) {
      const allHosts = new Set(hosts.map((h) => h.id));
      const allPorts = new Set(Object.values(portsByHost).flat().map((p) => p.id));
      const allVulns = new Set(Object.values(vulnsByHost).flat().map((v) => v.id));
      subnets.forEach((s) => subnetIds.add(s.id));
      return {
        matchingHostIds: allHosts,
        matchingPortIds: allPorts,
        matchingSubnetIds: subnetIds,
        matchingVulnIds: allVulns,
        hasMatchingUnresolved: (hostsBySubnet["_unresolved"] ?? []).length > 0,
        matchingUnassignedHostIds: new Set((hostsBySubnet["_unassigned"] ?? []).map((h) => h.id)),
        visibleHostCount: hosts.length,
      };
    }
    hosts.forEach((h) => {
      if (matchHost(parsedFilter, h)) hostIds.add(h.id);
    });
    Object.values(vulnsByHost).flat().forEach((v) => {
      if (matchVuln(parsedFilter, v)) {
        vulnIds.add(v.id);
        hostIds.add(v.host_id);
      }
    });
    hosts.forEach((h) => {
      (portsByHost[h.id] ?? []).forEach((p) => {
        if (matchPort(parsedFilter, p)) {
          portIds.add(p.id);
          hostIds.add(h.id);
        }
        (evidenceByPort[p.id] ?? []).forEach((ev) => {
          if (matchEvidence(parsedFilter, ev)) {
            portIds.add(p.id);
            hostIds.add(h.id);
          }
        });
      });
    });
    subnets.forEach((s) => {
      if ((hostsBySubnet[s.id] ?? []).some((h) => hostIds.has(h.id))) subnetIds.add(s.id);
    });
    const unresolvedHosts = hostsBySubnet["_unresolved"] ?? [];
    const unassignedHosts = hostsBySubnet["_unassigned"] ?? [];
    const visibleCount = [...new Set([...hostIds].filter((id) => hosts.some((h) => h.id === id)))].length;
    return {
      matchingHostIds: hostIds,
      matchingPortIds: portIds,
      matchingSubnetIds: subnetIds,
      matchingVulnIds: vulnIds,
      hasMatchingUnresolved: unresolvedHosts.some((h) => hostIds.has(h.id)),
      matchingUnassignedHostIds: new Set(unassignedHosts.filter((h) => hostIds.has(h.id)).map((h) => h.id)),
      visibleHostCount: visibleCount,
    };
  }, [parsedFilter, hosts, subnets, hostsBySubnet, portsByHost, evidenceByPort, vulnsByHost]);

  const activeTagFilter = activeTagFilterState;
  const {
    effectiveMatchingHostIds,
    effectiveMatchingSubnetIds,
    effectiveHasMatchingUnresolved,
    effectiveMatchingUnassignedHostIds,
    effectiveVisibleHostCount,
    tagFilterActive,
  } = useMemo(() => {
    const allHostIds = new Set(hosts.map((h) => h.id));
    if (!activeTagFilter) {
      return {
        effectiveMatchingHostIds: matchingHostIds,
        effectiveMatchingSubnetIds: matchingSubnetIds,
        effectiveHasMatchingUnresolved: hasMatchingUnresolved,
        effectiveMatchingUnassignedHostIds: matchingUnassignedHostIds,
        effectiveVisibleHostCount: visibleHostCount,
        tagFilterActive: false,
      };
    }
    const tagHosts = hostIdsByTagId[activeTagFilter.tagId] ?? new Set<string>();
    const effective = filterActive
      ? new Set([...tagHosts].filter((id) => matchingHostIds.has(id)))
      : new Set(tagHosts);
    const effectiveSubnets = new Set(
      subnets.filter((s) => (hostsBySubnet[s.id] ?? []).some((h) => effective.has(h.id))).map((s) => s.id)
    );
    const unresolvedHosts = hostsBySubnet["_unresolved"] ?? [];
    const unassignedHosts = hostsBySubnet["_unassigned"] ?? [];
    return {
      effectiveMatchingHostIds: effective,
      effectiveMatchingSubnetIds: effectiveSubnets,
      effectiveHasMatchingUnresolved: unresolvedHosts.some((h) => effective.has(h.id)),
      effectiveMatchingUnassignedHostIds: new Set(unassignedHosts.filter((h) => effective.has(h.id)).map((h) => h.id)),
      effectiveVisibleHostCount: effective.size,
      tagFilterActive: true,
    };
  }, [
    activeTagFilter,
    filterActive,
    matchingHostIds,
    matchingSubnetIds,
    hasMatchingUnresolved,
    matchingUnassignedHostIds,
    visibleHostCount,
    hostIdsByTagId,
    hosts,
    subnets,
    hostsBySubnet,
  ]);

  const filterNeedsEvidence = parsedFilter && (["page_title", "response_code", "server", "technology", "source", "screenshot"].includes(parsedFilter.attr) || parsedFilter.attr === "_smart");
  useEffect(() => {
    if (!filterActive || !filterNeedsEvidence) return;
    const allPortIds = Object.values(portsByHost).flat().map((p) => p.id);
    allPortIds.forEach((portId) => loadEvidenceForPort(portId));
  }, [filterActive, filterNeedsEvidence, portsByHost, loadEvidenceForPort]);

  // Load evidence and port notes when port detail pane is shown
  const selectedPortId = selectedNode?.type === "port" ? selectedNode.id : null;
  useEffect(() => {
    if (selectedPortId) {
      loadEvidenceForPort(selectedPortId);
      loadNotesForPort(selectedPortId);
    }
  }, [selectedPortId, loadEvidenceForPort, loadNotesForPort]);

  useEffect(() => {
    if (selectedNode?.type !== "tool-runs" || !missionId) return;
    setToolRunsLoading(true);
    fetch(apiUrl(`/api/projects/${missionId}/tool-runs`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data: { events: { id: string; timestamp: string; action_type: string; tool: string; details: Record<string, unknown> }[] }) => {
        setToolRunsEvents(data.events ?? []);
      })
      .finally(() => setToolRunsLoading(false));
  }, [selectedNode?.type, missionId]);

  const allVulns = Object.values(vulnsByHost).flat();
  const scopeSeverity = getHighestSeverity(
    vulnDefinitions.length > 0
      ? vulnDefinitions.map((d) => ({ definition_severity: d.severity, definition_cvss_score: d.cvss_score }))
      : allVulns
  );
  const subnetSeverity = (subnetId: string) => {
    const defsInSubnet = vulnDefinitions.filter((d) =>
      (d.affected_host_ids ?? []).some((hid) => (hostsBySubnet[subnetId] ?? []).some((h) => h.id === hid))
    );
    const vulnsInSubnet = (hostsBySubnet[subnetId] ?? []).flatMap((h) => vulnsByHost[h.id] ?? []);
    return getHighestSeverity(
      defsInSubnet.length > 0
        ? defsInSubnet.map((d) => ({ definition_severity: d.severity, definition_cvss_score: d.cvss_score }))
        : vulnsInSubnet
    );
  };
  const hostSeverity = (hostId: string) => getHighestSeverity(vulnsByHost[hostId] ?? []);
  const portSeverity = (hostId: string, portId: string) =>
    getHighestSeverity((vulnsByHost[hostId] ?? []).filter((v) => v.port_id === portId));

  const getLockForRecord = (recordType: string, recordId: string) =>
    locks.find((l) => l.record_type === recordType && l.record_id === recordId) ?? null;

  const lockableRecord = useMemo((): { recordType: string; recordId: string } | null => {
    if (!selectedNode) return null;
    switch (selectedNode.type) {
      case "subnet":
        return { recordType: "subnet", recordId: selectedNode.id };
      case "host":
        return { recordType: "host", recordId: selectedNode.id };
      case "host-ports":
      case "host-whois":
      case "host-whois-field":
      case "host-vulnerabilities":
        return { recordType: "host", recordId: selectedNode.hostId };
      case "port":
        return { recordType: "port", recordId: selectedNode.id };
      case "vuln-definition":
        return { recordType: "vulnerability_definition", recordId: selectedNode.id };
      default:
        return null;
    }
  }, [selectedNode]);

  const currentHostLock = selectedHost ? getLockForRecord("host", selectedHost.id) : null;

  const currentLockId =
    lockableRecord && currentUserId
      ? locks.find(
          (l) =>
            l.record_type === lockableRecord.recordType &&
            l.record_id === lockableRecord.recordId &&
            l.locked_by_user_id === currentUserId
        )?.id ?? null
      : null;

  const myHostLockId =
    selectedHost && currentUserId
      ? locks.find(
          (l) =>
            l.record_type === "host" &&
            l.record_id === selectedHost.id &&
            l.locked_by_user_id === currentUserId
        )?.id ?? null
      : null;

  useEffect(() => {
    if (!currentLockId) return;
    const interval = setInterval(() => renewLock(currentLockId), 60_000);
    return () => clearInterval(interval);
  }, [currentLockId, renewLock]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUserId || !missionId) return;
      const target = lockableRecord;
      const locksWeHold = locks.filter((l) => l.locked_by_user_id === currentUserId);
      for (const lock of locksWeHold) {
        if (cancelled) return;
        const isForTarget = target && lock.record_type === target.recordType && lock.record_id === target.recordId;
        if (!isForTarget) {
          try {
            await releaseLock(lock.id);
          } catch {
            // ignore release errors
          }
        }
      }
      if (cancelled) return;
      if (target) {
        const alreadyHave = locksWeHold.some((l) => l.record_type === target.recordType && l.record_id === target.recordId);
        if (!alreadyHave) {
          try {
            await acquireLock(target.recordType, target.recordId);
          } catch (e) {
            if (!cancelled) setToast(e instanceof Error ? e.message : "Failed to acquire lock");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockableRecord, locks, currentUserId, missionId, acquireLock, releaseLock, setToast]);

  const handleAcquireLock = async (recordType: string, recordId: string) => {
    setLockError("");
    try {
      await acquireLock(recordType, recordId);
    } catch (e) {
      setLockError(String(e));
    }
  };

  const handleReleaseLock = async (lockId: string) => {
    setLockError("");
    try {
      await releaseLock(lockId);
    } catch (e) {
      setLockError(String(e));
    }
  };

  const handleSaveHost = async (hostId: string, ip: string, dnsName: string) => {
    const lock = getLockForRecord("host", hostId);
    if (!lock) {
      setLockError("Acquire lock before editing");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/hosts/${hostId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), dns_name: (dnsName || "").trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to save");
      }
      setRenameHostModal(null);
      loadData();
    } catch (e) {
      setLockError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSubnet = async (cidr: string, name: string) => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/subnets"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: missionId,
          cidr: cidr.trim(),
          name: (name || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create subnet");
      }
      setAddSubnetModal(false);
      loadData();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleRenameSubnet = async (_subnetId: string, _cidr: string, _name: string) => {
    setRenameSubnetModal(null);
    setToast("Rename subnet (stub)");
  };

  const handleSaveNote = async (
    target: NoteTarget,
    targetId: string,
    title: string,
    bodyMd: string,
    fileAttachments: NoteAttachment[],
    existingNote?: Note
  ) => {
    const newAttachments: NoteAttachmentDisplay[] = fileAttachments.map((a, i) => ({
      id: `att-${Date.now()}-${i}`,
      filename: a.file.name,
      type: a.file.type,
      url: a.previewUrl ?? URL.createObjectURL(a.file),
    }));
    const baseNote = {
      title: title || null,
      body_md: bodyMd,
      attachments: [...(existingNote?.attachments ?? []), ...newAttachments],
      updated_by: "You" as const,
      updated_at: new Date().toISOString(),
    };
    const apiTargets: NoteTarget[] = ["scope", "subnet", "host", "host_ports", "port", "evidence", "vulnerabilities", "vulnerability_definition"];
    if (apiTargets.includes(target)) {
      try {
        if (existingNote) {
          const res = await fetch(apiUrl(`/api/notes/${existingNote.id}`), {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body_md: bodyMd }),
          });
          if (!res.ok) throw new Error("Failed to update note");
          const updatedNote: Note = { ...existingNote, ...baseNote };
          setProjectNotes((prev) => prev.map((n) => (n.id === existingNote.id ? updatedNote : n)));
          if (target === "scope") setScopeNotes((prev) => prev.map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)));
          else if (target === "subnet") setNotesBySubnet((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)) }));
          else if (target === "host" || target === "host_ports") setNotesByHost((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)) }));
          else if (target === "port") setNotesByPort((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)) }));
          else if (target === "evidence") setNotesByEvidence((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)) }));
        } else {
          const body: { project_id: string; target_type: string; target_id?: string | null; body_md: string } = {
            project_id: missionId,
            target_type: target,
            target_id: target === "scope" || target === "vulnerabilities" ? null : targetId || null,
            body_md: bodyMd,
          };
          const res = await fetch(apiUrl("/api/notes"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("Failed to create note");
          const created = await res.json();
          const newNote: Note = {
            ...created,
            target_type: created.target_type ?? target,
            target_id: created.target_id ?? (target === "scope" || target === "vulnerabilities" ? null : targetId),
            title: title || null,
            attachments: newAttachments,
            created_by: "You",
            updated_by: "You",
          };
          setProjectNotes((prev) => [newNote, ...prev]);
          setNotesVersion((v) => v + 1);
          if (target === "scope") {
            setScopeNotes((prev) => [newNote, ...prev]);
            setScopeNotesLoaded(true);
          } else if (target === "subnet") {
            setNotesBySubnet((prev) => ({ ...prev, [targetId]: [newNote, ...(prev[targetId] ?? [])] }));
            setNotesBySubnetLoaded((p) => new Set(p).add(targetId));
          } else if (target === "host" || target === "host_ports") {
            setNotesByHost((prev) => ({ ...prev, [targetId]: [newNote, ...(prev[targetId] ?? [])] }));
            setNotesLoaded((p) => new Set(p).add(targetId));
          } else if (target === "port") {
            setNotesByPort((prev) => ({ ...prev, [targetId]: [newNote, ...(prev[targetId] ?? [])] }));
            setNotesByPortLoaded((p) => new Set(p).add(targetId));
          } else if (target === "evidence") {
            setNotesByEvidence((prev) => ({ ...prev, [targetId]: [newNote, ...(prev[targetId] ?? [])] }));
            setNotesByEvidenceLoaded((p) => new Set(p).add(targetId));
          }
        }
        setNoteModal(null);
        setToast("Note saved");
      } catch (e) {
        setToast(String(e));
      }
      return;
    }
  };

  const handleDeleteNote = async (note: Note, target: NoteTarget, targetId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/notes/${note.id}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete note");
      setProjectNotes((prev) => prev.filter((n) => n.id !== note.id));
      setNotesVersion((v) => v + 1);
      if (target === "scope") setScopeNotes((prev) => prev.filter((n) => n.id !== note.id));
      else if (target === "subnet") setNotesBySubnet((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== note.id) }));
      else if (target === "host" || target === "host_ports") setNotesByHost((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== note.id) }));
      else if (target === "port") setNotesByPort((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== note.id) }));
      else if (target === "evidence") setNotesByEvidence((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== note.id) }));
      setDeleteNoteModal(null);
      setSelectedNode(null);
      setToast("Note deleted");
    } catch (e) {
      setToast(String(e));
    }
  };

  const handleCreatePort = async (
    hostId: string,
    data: { number: number; protocol: "tcp" | "udp"; state: string; service_name: string | null; description_md: string | null; evidence_md: string | null }
  ): Promise<Port | void> => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/ports"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host_id: hostId,
          protocol: data.protocol,
          number: data.number,
          state: data.state || "unknown",
          service_name: data.service_name,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
          discovered_by: "manual",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create port");
      }
      const created = await res.json();
      setPortsByHost((prev) => {
        const list = prev[hostId] ?? [];
        return { ...prev, [hostId]: [...list, created].sort((a: Port, b: Port) => a.number - b.number || String(a.protocol).localeCompare(String(b.protocol))) };
      });
      setPortsLoaded((p) => new Set(p).add(hostId));
      setToast("Port added");
      return created;
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleUpdatePort = async (
    hostId: string,
    portId: string,
    data: { number: number; protocol: "tcp" | "udp"; state: string; service_name: string | null; description_md: string | null; evidence_md: string | null }
  ) => {
    setLockError("");
    try {
      await acquireLock("port", portId);
      const res = await fetch(apiUrl(`/api/ports/${portId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: data.state || "unknown",
          service_name: data.service_name,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to update port");
      }
      const updated = await res.json();
      setPortModal(null);
      setPortsByHost((prev) => ({
        ...prev,
        [hostId]: (prev[hostId] ?? []).map((p) => (p.id === portId ? { ...p, ...updated } : p)),
      }));
      setToast("Port updated");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleDeleteEvidence = async (portId: string, evId: string, hostId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/ports/${portId}/attachments/${evId}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Failed to delete evidence");
      }
      setEvidenceByPort((prev) => {
        const list = (prev[portId] ?? []).filter((e) => e.id !== evId);
        return { ...prev, [portId]: list };
      });
      if (selectedNode?.type === "port-evidence" && selectedNode.id === evId) {
        setSelectedNode({ type: "port", id: portId });
      }
      setToast("Report deleted");
    } catch (err) {
      setToast(String(err));
    }
  };

  const handleDeletePort = async (portId: string, hostId: string) => {
    setLockError("");
    try {
      await acquireLock("port", portId);
      const res = await fetch(apiUrl(`/api/ports/${portId}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to delete port");
      }
      setDeletePortModal(null);
      setPortsByHost((prev) => ({ ...prev, [hostId]: (prev[hostId] ?? []).filter((p) => p.id !== portId) }));
      setSelectedNode(null);
      setToast("Port deleted");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleDeleteHost = async (hostId: string) => {
    setLockError("");
    try {
      await acquireLock("host", hostId);
      const res = await fetch(apiUrl(`/api/hosts/${hostId}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to delete host");
      }
      setDeleteHostModal(null);
      const portIds = (portsByHost[hostId] ?? []).map((p) => p.id);
      setHosts((prev) => prev.filter((h) => h.id !== hostId));
      setPortsByHost((prev) => { const next = { ...prev }; delete next[hostId]; return next; });
      setVulnsByHost((prev) => { const next = { ...prev }; delete next[hostId]; return next; });
      setNotesByHost((prev) => { const next = { ...prev }; delete next[hostId]; return next; });
      setNotesLoaded((prev) => { const n = new Set(prev); n.delete(hostId); return n; });
      setEvidenceByPort((prev) => { const next = { ...prev }; portIds.forEach((id) => delete next[id]); return next; });
      setEvidenceLoaded((prev) => { const n = new Set(prev); portIds.forEach((id) => n.delete(id)); return n; });
      setNotesByPort((prev) => { const next = { ...prev }; portIds.forEach((id) => delete next[id]); return next; });
      setNotesByPortLoaded((prev) => { const n = new Set(prev); portIds.forEach((id) => n.delete(id)); return n; });
      setPortsLoaded((prev) => { const n = new Set(prev); n.delete(hostId); return n; });
      setVulnsLoaded((prev) => { const n = new Set(prev); n.delete(hostId); return n; });
      if (selectedNode && (selectedNode.type === "host" || selectedNode.type === "host-ports" || selectedNode.type === "host-whois" || selectedNode.type === "host-whois-field" || selectedNode.type === "host-vulnerabilities") && (selectedNode.type === "host" ? selectedNode.id : selectedNode.hostId) === hostId) setSelectedNode(null);
      if (selectedNode?.type === "port" && portsByHost[hostId]?.some((p) => p.id === selectedNode.id)) setSelectedNode(null);
      if (selectedNode?.type === "port-evidence" && portIds.includes(selectedNode.portId)) setSelectedNode(null);
      if (selectedNode?.type === "note" && selectedNode.target === "host" && selectedNode.targetId === hostId) setSelectedNode(null);
      setToast("Host and all its ports, evidence, and notes deleted");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleDeleteSubnet = async (subnetId: string) => {
    setLockError("");
    try {
      await acquireLock("subnet", subnetId);
      const res = await fetch(apiUrl(`/api/subnets/${subnetId}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to delete subnet");
      }
      setDeleteSubnetModal(null);
      const hostsInSubnet = hosts.filter((h) => h.subnet_id === subnetId);
      const hostIdsToRemove = new Set(hostsInSubnet.map((h) => h.id));
      const portIdsToRemove = new Set(hostsInSubnet.flatMap((h) => (portsByHost[h.id] ?? []).map((p) => p.id)));
      setSubnets((prev) => prev.filter((s) => s.id !== subnetId));
      setHosts((prev) => prev.filter((h) => !hostIdsToRemove.has(h.id)));
      setPortsByHost((prev) => { const next = { ...prev }; hostIdsToRemove.forEach((hid) => delete next[hid]); return next; });
      setVulnsByHost((prev) => { const next = { ...prev }; hostIdsToRemove.forEach((hid) => delete next[hid]); return next; });
      setNotesByHost((prev) => { const next = { ...prev }; hostIdsToRemove.forEach((hid) => delete next[hid]); return next; });
      setNotesLoaded((prev) => { const n = new Set(prev); hostIdsToRemove.forEach((id) => n.delete(id)); return n; });
      setEvidenceByPort((prev) => { const next = { ...prev }; portIdsToRemove.forEach((id) => delete next[id]); return next; });
      setEvidenceLoaded((prev) => { const n = new Set(prev); portIdsToRemove.forEach((id) => n.delete(id)); return n; });
      setNotesByPort((prev) => { const next = { ...prev }; portIdsToRemove.forEach((id) => delete next[id]); return next; });
      setNotesByPortLoaded((prev) => { const n = new Set(prev); portIdsToRemove.forEach((id) => n.delete(id)); return n; });
      setPortsLoaded((prev) => { const n = new Set(prev); hostIdsToRemove.forEach((id) => n.delete(id)); return n; });
      setVulnsLoaded((prev) => { const n = new Set(prev); hostIdsToRemove.forEach((id) => n.delete(id)); return n; });
      setNotesBySubnet((prev) => { const next = { ...prev }; delete next[subnetId]; return next; });
      setNotesBySubnetLoaded((prev) => { const n = new Set(prev); n.delete(subnetId); return n; });
      if (selectedNode?.type === "subnet" && selectedNode.id === subnetId) setSelectedNode(null);
      if (selectedNode && (selectedNode.type === "host" || selectedNode.type === "host-ports" || selectedNode.type === "host-whois" || selectedNode.type === "host-whois-field" || selectedNode.type === "host-vulnerabilities") && hostIdsToRemove.has(selectedNode.type === "host" ? selectedNode.id : selectedNode.hostId)) setSelectedNode(null);
      if (selectedNode?.type === "port" && portIdsToRemove.has(selectedNode.id)) setSelectedNode(null);
      if (selectedNode?.type === "port-evidence" && portIdsToRemove.has(selectedNode.portId)) setSelectedNode(null);
      if (selectedNode?.type === "note" && (selectedNode.targetId === subnetId || (selectedNode.target === "host" && hostIdsToRemove.has(selectedNode.targetId)))) setSelectedNode(null);
      setToast("Subnet and all hosts, ports, evidence, and notes deleted");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleMoveSubnetScope = useCallback(async (subnetId: string, inScope: boolean) => {
    try {
      await acquireLock("subnet", subnetId);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not acquire lock; try again or select the subnet first");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/subnets/${subnetId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ in_scope: inScope }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to update subnet");
      }
      setSubnets((prev) => prev.map((s) => (s.id === subnetId ? { ...s, in_scope: inScope } : s)));
      setToast(inScope ? "Moved back into scope" : "Moved out of scope");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to update scope");
    }
  }, [acquireLock, setToast]);

  const handleMoveHostScope = useCallback(async (hostId: string, inScope: boolean) => {
    try {
      await acquireLock("host", hostId);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not acquire lock; try again or select the host first");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/hosts/${hostId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ in_scope: inScope }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to update host");
      }
      setHosts((prev) => prev.map((h) => (h.id === hostId ? { ...h, in_scope: inScope } : h)));
      setToast(inScope ? "Moved back into scope" : "Moved out of scope");
      if (!inScope && missionId) {
        const sortQ = `&sort_mode=${encodeURIComponent(mission?.sort_mode ?? "cidr_asc")}`;
        const subnetsRes = await fetch(apiUrl(`/api/subnets?project_id=${missionId}${sortQ}`), { credentials: "include" });
        if (subnetsRes.ok) {
          const list = await subnetsRes.json();
          setSubnets(list);
        }
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to update scope");
    }
  }, [acquireLock, setToast, missionId, mission?.sort_mode]);

  const handleCreateVuln = async (data: {
    hostIds: string[];
    title: string;
    severity: string;
    cvss_score: number | null;
    cve_ids: string[];
    description_md: string | null;
    evidence_md: string | null;
    subnet_ids: string[];
  }): Promise<{ id: string } | void> => {
    setLockError("");
    try {
      const hostIds = data.hostIds.length > 0 ? data.hostIds : [hosts[0]?.id].filter(Boolean) as string[];
      if (hostIds.length === 0) {
        setLockError("No hosts selected");
        return;
      }
      const res = await fetch(apiUrl("/api/vulnerability-definitions"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: missionId,
          host_id: hostIds[0],
          port_id: null,
          subnet_ids: data.subnet_ids ?? [],
          title: data.title,
          severity: data.severity,
          cvss_score: data.cvss_score,
          cve_ids: data.cve_ids,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Failed to create vulnerability");
      }
      const created = await res.json();
      if (hostIds.length > 1) {
        const patchRes = await fetch(apiUrl(`/api/vulnerability-definitions/${created.id}/affected-hosts`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host_ids: hostIds }),
        });
        if (!patchRes.ok) {
          setLockError("Created but failed to apply to all hosts");
        }
      }
      refreshVulnDefinitions();
      hostIds.forEach((id) => loadVulnsForHost(id));
      setToast("Vulnerability added");
      return { id: created.id };
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleUpdateVuln = async (
    definitionId: string,
    data: {
      hostIds: string[];
      title: string;
      severity: string;
      cvss_score: number | null;
      cve_ids: string[];
      description_md: string | null;
      evidence_md: string | null;
      subnet_ids: string[];
    }
  ) => {
    setLockError("");
    try {
      await acquireLock("vulnerability_definition", definitionId);
      const res = await fetch(apiUrl(`/api/vulnerability-definitions/${definitionId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          severity: data.severity,
          cvss_score: data.cvss_score,
          cve_ids: data.cve_ids,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
          subnet_ids: data.subnet_ids ?? [],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Failed to update vulnerability");
      }
      if (data.hostIds.length > 0) {
        const patchRes = await fetch(apiUrl(`/api/vulnerability-definitions/${definitionId}/affected-hosts`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host_ids: data.hostIds }),
        });
        if (!patchRes.ok) {
          setLockError("Updated but failed to sync affected hosts");
        }
      }
      setVulnModal(null);
      refreshVulnDefinitions();
      hosts.forEach((h) => loadVulnsForHost(h.id));
      setToast("Vulnerability updated");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleDeleteVuln = async (definitionId: string) => {
    setLockError("");
    try {
      await acquireLock("vulnerability_definition", definitionId);
      const res = await fetch(apiUrl(`/api/vulnerability-definitions/${definitionId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to delete vulnerability");
      }
      setDeleteVulnModal(null);
      refreshVulnDefinitions();
      setVulnDefinitions((prev) => prev.filter((d) => d.id !== definitionId));
      setVulnsByHost((prev) => {
        const next: Record<string, VulnInstance[]> = {};
        for (const [hId, list] of Object.entries(prev)) {
          const filtered = list.filter((v) => v.vulnerability_definition_id !== definitionId);
          if (filtered.length > 0) next[hId] = filtered;
        }
        return next;
      });
      setSelectedNode(null);
      setToast("Vulnerability deleted");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleCreateHost = async (ip: string, dnsName: string, subnetId: string | null) => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/hosts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: missionId,
          subnet_id: subnetId || null,
          ip: ip.trim(),
          dns_name: (dnsName || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create host");
      }
      setAddHostModal(null);
      loadData();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const expandHostAndLoad = (hostId: string) => {
    loadPortsForHost(hostId, mission?.sort_mode || "cidr_asc");
    loadVulnsForHost(hostId);
  };

  const handleSortModeChange = (newMode: string) => {
    if (!missionId || newMode === (mission?.sort_mode || "cidr_asc")) return;
    fetch(apiUrl(`/api/projects/${missionId}/sort-mode`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_mode: newMode }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to update sort");
        return r.json();
      })
      .then((proj) => {
        setMission(proj);
        loadData();
      })
      .catch((e) => setToast(e instanceof Error ? e.message : "Failed to update sort"));
  };

  const scopeSortMenuItems = [
    { label: "CIDR ↑", value: "cidr_asc" },
    { label: "CIDR ↓", value: "cidr_desc" },
    { label: "Name ↑", value: "alpha_asc" },
    { label: "Name ↓", value: "alpha_desc" },
    { label: "Last seen ↓", value: "last_seen_desc" },
  ].map(({ label, value }) => ({ label, onClick: () => handleSortModeChange(value) }));

  useEffect(() => {
    if (portModal || vulnModal) setLockError("");
  }, [portModal, vulnModal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUserId(u?.id ?? null))
      .catch(() => {});
  }, []);

  if (loading) return <main style={{ padding: 24, color: "var(--text)" }}>Loading…</main>;
  if (error)
    return (
      <main style={{ padding: 24, color: "var(--error)" }}>
        Error: {error}
        <div style={{ marginTop: 16 }}>
          <Link href="/missions" className="theme-link">Switch mission</Link>
        </div>
      </main>
    );
  if (!mission) return null;

  const treeStyle = {
    width: treeWidth,
    minWidth: 220,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    overflowY: "auto" as const,
    padding: "8px 0",
    fontSize: 13,
    backgroundColor: "var(--tree-bg)",
    color: "var(--text)",
  };

  const nodeStyle = (depth: number) =>
    ({ padding: "4px 8px 4px " + (12 + depth * 12) + "px", display: "flex", alignItems: "center", gap: 6, minHeight: 24, color: "var(--text)" } as React.CSSProperties);

  const whoisFields = ["network", "asn", "country", "cidr", "type", "registry"] as const;

  const renderTreeHost = (h: Host, baseDepth: number, isOutOfScope?: boolean) => {
    const hKey = `host:${h.id}`;
    const portsKey = `host-ports:${h.id}`;
    const vulnsKey = `host-vulns:${h.id}`;
    const whoisKey = `host-whois:${h.id}`;
    const hExp = expanded.has(hKey);
    const portsExp = expanded.has(portsKey);
    const vulnsExp = expanded.has(vulnsKey);
    const whoisExp = expanded.has(whoisKey);
    const allPorts = portsByHost[h.id] ?? [];
    const ports = allPorts;
    const allVulns = vulnsByHost[h.id] ?? [];
    const vulns = allVulns;
    const portsLoad = portsLoading.has(h.id);
    const vulnsLoad = vulnsLoading.has(h.id);
    const notesLoad = notesLoading.has(h.id);
    const portCount = portsLoaded.has(h.id) ? ports.length : null;
    const vulnCount = vulnsLoaded.has(h.id) ? vulns.length : null;
    const hasVulns = vulnCount !== null && vulnCount > 0;
    const portCountStr =
      portCount !== null && filterActive && allPorts.length !== ports.length
        ? `${ports.length} of ${allPorts.length}`
        : portCount !== null
          ? String(portCount)
          : null;
    const vulnCountStr =
      vulnCount !== null && filterActive && allVulns.length !== vulns.length
        ? `${vulns.length} of ${allVulns.length}`
        : vulnCount !== null
          ? String(vulnCount)
          : null;
    const countStr = isUnresolvedHost(h)
      ? ""
      : portCountStr !== null && vulnCountStr !== null && hasVulns
        ? ` (${portCountStr} ports • ${vulnCountStr} vulns)`
        : portCountStr !== null
          ? ` (${portCountStr} ports)`
          : vulnCountStr !== null && hasVulns
            ? ` (${vulnCountStr} vulns)`
            : "";

    return (
      <div key={h.id}>
        <div
          className={"theme-tree-node" + (selectedNode?.type === "host" && selectedNode.id === h.id ? " selected" : "")}
          style={{ ...nodeStyle(baseDepth), color: isOutOfScope ? "var(--text-muted)" : (hostSeverity(h.id) ? getSeverityColor(hostSeverity(h.id)) : "var(--text)") }}
          onClick={(ev) => {
            ev.stopPropagation();
            toggleExpand(hKey, () => expandHostAndLoad(h.id));
            setSelectedNode({ type: "host", id: h.id });
          }}
          onContextMenu={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setSelectedNode({ type: "host", id: h.id });
            setContextMenu({
              x: ev.clientX,
              y: ev.clientY,
              items: [
                { label: "Expand/Collapse", onClick: () => toggleExpandCollapse(hKey) },
                { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                { label: "Copy IP address", onClick: () => navigator.clipboard.writeText(h.ip ?? "").then(() => setToast("Copied to clipboard")).catch(() => setToast("Failed to copy")) },
                { label: "Copy Hostname", onClick: () => navigator.clipboard.writeText(h.dns_name ?? "").then(() => setToast("Copied to clipboard")).catch(() => setToast("Failed to copy")) },
                h.in_scope !== false
                  ? { label: "Move out of scope", onClick: () => handleMoveHostScope(h.id, false) }
                  : { label: "Move back into scope", onClick: () => handleMoveHostScope(h.id, true) },
                { label: "Add Port", onClick: () => setPortModal({ mode: "add", host: h }) },
                { label: "Add Vulnerability", onClick: () => setVulnModal({ mode: "add", host: h }) },
                { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "host", host: h }) },
                { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "host", parentId: h.id, contextLabel: hostLabel(h) }) },
                { label: "Add tag", onClick: () => setAddTagModal({ targetType: "host", targetId: h.id }) },
                { label: "Rename", onClick: () => setRenameHostModal(h) },
                { label: "Delete", onClick: () => setDeleteHostModal(h) },
              ],
            });
          }}
        >
          <span style={{ width: 14, display: "inline-block", textAlign: "center" }}>{hExp ? "▼" : "▶"}</span>
          <ReachabilityDot status={getEffectiveHostStatus(h)} />
          <span style={{ fontWeight: 500 }}>{hostLabel(h)}{countStr}</span>
          {!h.subnet_id && !isUnresolvedHost(h) && <span style={{ color: "var(--text-dim)", fontSize: 11 }}> (unassigned)</span>}
        </div>
        {hExp && (
          <>
            {projectNotes.filter((n) => n.target_type === "host" && n.target_id === h.id).map((n) => {
                const isSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "host";
                const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                return (
                  <div
                    key={n.id}
                    className={"theme-tree-node" + (isSel ? " selected" : "")}
                    style={{ ...nodeStyle(baseDepth + 1), color: "var(--text-muted)" }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "host", targetId: h.id }); }}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setContextMenu({
                        x: ev.clientX,
                        y: ev.clientY,
                        items: [
                          { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "host", host: h, note: n }) },
                          { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "host", host: h }) },
                          { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "host", host: h }) },
                        ],
                      });
                    }}
                  >
                    <span style={{ width: 14 }}>≡</span>
                    <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                  </div>
                );
              })}
            {projectTodos.filter((t) => t.target_type === "host" && t.target_id === h.id).map((t) => {
              const isSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
              return (
                <div
                  key={t.id}
                  className={"theme-tree-node" + (isSel ? " selected" : "")}
                  style={{ ...nodeStyle(baseDepth + 1), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                  onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                >
                  <span style={{ width: 14 }}>•</span>
                  {t.title}
                </div>
              );
            })}
            {getItemTagsFor("host", h.id).map((it) => {
              const isSel = selectedNode?.type === "tag" && selectedNode.itemTagId === it.id;
              return (
                <div
                  key={it.id}
                  className={"theme-tree-node" + (isSel ? " selected" : "")}
                  style={{ ...nodeStyle(baseDepth + 1), color: it.tag_color ?? "var(--text-muted)" }}
                  onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tag", itemTagId: it.id, tagId: it.tag_id, tagName: it.tag_name ?? "", targetType: "host", targetId: h.id }); }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setContextMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      items: [{ label: "Remove tag", onClick: () => handleRemoveItemTag(it.id) }],
                    });
                  }}
                >
                  <span style={{ width: 14 }}>🏷</span>
                  <span>{it.tag_name ?? ""}</span>
                </div>
              );
            })}
            {h.whois_data && Object.keys(h.whois_data).length > 0 && (
              <>
                <div
                  className={"theme-tree-node" + (selectedNode?.type === "host-whois" && selectedNode.hostId === h.id ? " selected" : "")}
                  style={nodeStyle(baseDepth + 1)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleExpand(whoisKey);
                    setSelectedNode({ type: "host-whois", hostId: h.id });
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setSelectedNode({ type: "host-whois", hostId: h.id });
                    setContextMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      items: [
                        { label: "Expand/Collapse", onClick: () => toggleExpandCollapse(whoisKey) },
                        { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                      ],
                    });
                  }}
                >
                  <span style={{ width: 14, textAlign: "center" }}>{whoisExp ? "▼" : "▶"}</span>
                  <HelpCircle style={navIconStyle} />
                  Whois
                </div>
                {whoisExp && whoisFields.map((field) => {
                  const val = getWhoisDisplayValue(h.whois_data, field);
                  if (val === "") return null;
                  const isSel = selectedNode?.type === "host-whois-field" && selectedNode.hostId === h.id && selectedNode.field === field;
                  return (
                    <div
                      key={field}
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={nodeStyle(baseDepth + 2)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedNode({ type: "host-whois-field", hostId: h.id, field });
                      }}
                    >
                      <span style={{ width: 14 }}>·</span>
                      {WHOIS_FIELD_LABELS[field]}
                    </div>
                  );
                })}
              </>
            )}
            <div
              className={"theme-tree-node" + (selectedNode?.type === "host-ports" && selectedNode.hostId === h.id ? " selected" : "")}
              style={nodeStyle(baseDepth + 1)}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpand(portsKey, () => loadPortsForHost(h.id, mission?.sort_mode || "cidr_asc"));
                setSelectedNode({ type: "host-ports", hostId: h.id });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setContextMenu({
                  x: ev.clientX,
                  y: ev.clientY,
                  items: [
                    { label: "Expand/Collapse", onClick: () => toggleExpandCollapse(portsKey) },
                    { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                    { label: "Add Port", onClick: () => setPortModal({ mode: "add", host: h }) },
                    { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "host_ports", host: h }) },
                    { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "host_ports", parentId: h.id, contextLabel: `Ports on ${hostLabel(h)}` }) },
                  ],
                });
              }}
            >
              <span style={{ width: 14, textAlign: "center" }}>{portsExp ? "▼" : "▶"}</span>
              <Network style={navIconStyle} />
              <span>Ports</span>
              {portsLoad && <Spinner />}
              {portsLoaded.has(h.id) && !portsLoad && (
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  ({filterActive && allPorts.length !== ports.length ? `${ports.length} of ${allPorts.length}` : ports.length})
                </span>
              )}
            </div>
            {portsExp && (
              <>
                {projectNotes.filter((n) => n.target_type === "host_ports" && n.target_id === h.id).map((n) => {
                  const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "host_ports";
                  const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                  return (
                    <div
                      key={n.id}
                      className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                      style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)" }}
                      onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "host_ports", targetId: h.id }); }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setContextMenu({
                          x: ev.clientX,
                          y: ev.clientY,
                          items: [
                            { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "host_ports", host: h, note: n }) },
                            { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "host_ports", host: h }) },
                            { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "host_ports", host: h }) },
                          ],
                        });
                      }}
                    >
                      <span style={{ width: 14 }}>≡</span>
                      <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                    </div>
                  );
                })}
                {projectTodos.filter((t) => t.target_type === "host_ports" && t.target_id === h.id).map((t) => {
                  const isSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                  return (
                    <div
                      key={t.id}
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                      onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                    >
                      <span style={{ width: 14 }}>•</span>
                      {t.title}
                    </div>
                  );
                })}
                {portsLoad ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                ) : (
                  ports.map((p) => {
                    const portEvKey = `port-evidence:${p.id}`;
                    const portEvExp = expanded.has(portEvKey);
                    const rawEvList = evidenceByPort[p.id] ?? [];
                    const evList = filterActive && parsedFilter ? rawEvList.filter((ev) => matchEvidence(parsedFilter, ev)) : rawEvList;
                    const evLoad = evidenceLoading.has(p.id);
                    const evLoaded = evidenceLoaded.has(p.id);
                    const isSel = selectedNode?.type === "port" && selectedNode.id === p.id;
                    const evCount = evLoaded ? evList.length : null;
                    return (
                      <div key={p.id}>
                        <div
                          className={"theme-tree-node" + (isSel ? " selected" : "")}
                          style={{ ...nodeStyle(baseDepth + 2), color: portSeverity(h.id, p.id) ? getSeverityColor(portSeverity(h.id, p.id)) : "var(--text)" }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleExpand(portEvKey, () => loadEvidenceForPort(p.id));
                            setSelectedNode({ type: "port", id: p.id });
                          }}
                          onContextMenu={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (!notesByPortLoaded.has(p.id) && !notesByPortLoading.has(p.id)) loadNotesForPort(p.id);
                            setContextMenu({
                              x: ev.clientX,
                              y: ev.clientY,
                              items: [
                                { label: "Edit Port", onClick: () => setPortModal({ mode: "edit", host: h, port: p }) },
                                { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "port", port: p, host: h }) },
                                { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "port", parentId: p.id, contextLabel: `${p.number}/${p.protocol} on ${hostLabel(h)}` }) },
                                { label: "Add tag", onClick: () => setAddTagModal({ targetType: "port", targetId: p.id, hostId: h.id }) },
                                { label: "Delete Port", onClick: () => setDeletePortModal({ port: p, host: h }) },
                              ],
                            });
                          }}
                        >
                          <span style={{ width: 14 }}>{portEvExp ? "▼" : "▶"}</span>
                          {p.number}/{p.protocol}
                          {p.service_name && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> {p.service_name}</span>}
                          {evCount !== null && evCount > 0 && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({evCount})</span>}
                        </div>
                        {portEvExp && (
                          <>
                            {projectNotes.filter((n) => n.target_type === "port" && n.target_id === p.id).map((n) => {
                                const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "port";
                                const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                                return (
                                  <div
                                    key={n.id}
                                    className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                                    style={{ ...nodeStyle(baseDepth + 3), color: "var(--text-muted)" }}
                                    onClick={(evt) => { evt.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "port", targetId: p.id }); }}
                                    onContextMenu={(evt) => {
                                      evt.preventDefault();
                                      evt.stopPropagation();
                                      setContextMenu({
                                        x: evt.clientX,
                                        y: evt.clientY,
                                        items: [
                                          { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "port", port: p, host: h, note: n }) },
                                          { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "port", port: p }) },
                                          { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "port", host: h, port: p }) },
                                        ],
                                      });
                                    }}
                                  >
                                    <span style={{ width: 14 }}>≡</span>
                                    <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                                  </div>
                                );
                              })}
                            {projectTodos.filter((t) => t.target_type === "port" && t.target_id === p.id).map((t) => {
                              const isTodoSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                              return (
                                <div
                                  key={t.id}
                                  className={"theme-tree-node" + (isTodoSel ? " selected" : "")}
                                  style={{ ...nodeStyle(baseDepth + 3), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                                  onClick={(evt) => { evt.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                                >
                                  <span style={{ width: 14 }}>•</span>
                                  {t.title}
                                </div>
                              );
                            })}
                            {getItemTagsFor("port", p.id).map((it) => {
                              const isSel = selectedNode?.type === "tag" && selectedNode.itemTagId === it.id;
                              return (
                                <div
                                  key={it.id}
                                  className={"theme-tree-node" + (isSel ? " selected" : "")}
                                  style={{ ...nodeStyle(baseDepth + 3), color: it.tag_color ?? "var(--text-muted)" }}
                                  onClick={(evt) => { evt.stopPropagation(); setSelectedNode({ type: "tag", itemTagId: it.id, tagId: it.tag_id, tagName: it.tag_name ?? "", targetType: "port", targetId: p.id, hostId: h.id }); }}
                                  onContextMenu={(evt) => {
                                    evt.preventDefault();
                                    evt.stopPropagation();
                                    setContextMenu({
                                      x: evt.clientX,
                                      y: evt.clientY,
                                      items: [{ label: "Remove tag", onClick: () => handleRemoveItemTag(it.id) }],
                                    });
                                  }}
                                >
                                  <span style={{ width: 14 }}>🏷</span>
                                  <span>{it.tag_name ?? ""}</span>
                                </div>
                              );
                            })}
                            {evLoad ? (
                              <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 3), color: "var(--text-muted)" }}>Loading…</div>
                            ) : evList.length === 0 ? (
                              <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 3), color: "var(--text-dim)", fontStyle: "italic" }}>No reports</div>
                            ) : (
                              evList.map((ev) => {
                                const evSel = selectedNode?.type === "port-evidence" && selectedNode.id === ev.id;
                                const label = ev.caption || ev.filename;
                                return (
                                  <div key={ev.id}>
                                    <div
                                      className={"theme-tree-node" + (evSel ? " selected" : "")}
                                      style={nodeStyle(baseDepth + 3)}
                                      onClick={(evt) => {
                                        evt.stopPropagation();
                                        setSelectedNode({ type: "port-evidence", id: ev.id, portId: p.id, hostId: h.id });
                                      }}
                                      onContextMenu={(evt) => {
                                        evt.preventDefault();
                                        evt.stopPropagation();
                                        setContextMenu({
                                          x: evt.clientX,
                                          y: evt.clientY,
                                          items: [
                                            { label: "Add note", onClick: () => setNoteModal({ mode: "add", target: "evidence", evidence: ev }) },
                                            { label: "Add tag", onClick: () => setAddTagModal({ targetType: "port_evidence", targetId: ev.id, portId: p.id, hostId: h.id }) },
                                            { label: "Delete", onClick: () => handleDeleteEvidence(p.id, ev.id, h.id) },
                                          ],
                                        });
                                      }}
                                    >
                                      <span style={{ width: 14 }}>•</span>
                                      <span style={{ fontSize: 13 }}>{label}</span>
                                    </div>
                                    {getItemTagsFor("port_evidence", ev.id).map((it) => {
                                      const isTagSel = selectedNode?.type === "tag" && selectedNode.itemTagId === it.id;
                                      return (
                                        <div
                                          key={it.id}
                                          className={"theme-tree-node" + (isTagSel ? " selected" : "")}
                                          style={{ ...nodeStyle(baseDepth + 4), color: it.tag_color ?? "var(--text-muted)" }}
                                          onClick={(evt) => { evt.stopPropagation(); setSelectedNode({ type: "tag", itemTagId: it.id, tagId: it.tag_id, tagName: it.tag_name ?? "", targetType: "port_evidence", targetId: ev.id, portId: p.id, hostId: h.id }); }}
                                          onContextMenu={(evt) => {
                                            evt.preventDefault();
                                            evt.stopPropagation();
                                            setContextMenu({
                                              x: evt.clientX,
                                              y: evt.clientY,
                                              items: [{ label: "Remove tag", onClick: () => handleRemoveItemTag(it.id) }],
                                            });
                                          }}
                                        >
                                          <span style={{ width: 14 }}>🏷</span>
                                          <span>{it.tag_name ?? ""}</span>
                                        </div>
                                      );
                                    })}
                                    {/* Evidence notes as child nodes */}
                                    {projectNotes.filter((n) => n.target_type === "evidence" && n.target_id === ev.id).map((n) => {
                                        const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "evidence";
                                        const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                                        return (
                                          <div
                                            key={n.id}
                                            className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                                            style={{ ...nodeStyle(baseDepth + 4), color: "var(--text-muted)" }}
                                            onClick={(evt) => { evt.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "evidence", targetId: ev.id }); }}
                                            onContextMenu={(evt) => {
                                              evt.preventDefault();
                                              evt.stopPropagation();
                                              setContextMenu({
                                                x: evt.clientX,
                                                y: evt.clientY,
                                                items: [
                                                  { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "evidence", evidence: ev, note: n }) },
                                                  { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "evidence", evidence: ev }) },
                                                  { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "evidence", evidence: ev }) },
                                                ],
                                              });
                                            }}
                                          >
                                            <span style={{ width: 14 }}>≡</span>
                                            <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                                          </div>
                                        );
                                      })}
                                  </div>
                                );
                              })
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
            {hasVulns && (
              <>
                <div
                  className={"theme-tree-node" + (selectedNode?.type === "host-vulnerabilities" && selectedNode.hostId === h.id ? " selected" : "")}
                  style={nodeStyle(baseDepth + 1)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleExpand(vulnsKey, () => loadVulnsForHost(h.id));
                    setSelectedNode({ type: "host-vulnerabilities", hostId: h.id });
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setContextMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      items: [
                        { label: "Expand/Collapse", onClick: () => toggleExpandCollapse(vulnsKey) },
                        { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                        { label: "Add Vulnerability", onClick: () => setVulnModal({ mode: "add", host: h }) },
                      ],
                    });
                  }}
                >
                  <span style={{ width: 14, textAlign: "center" }}>{vulnsExp ? "▼" : "▶"}</span>
                  <TriangleAlert style={navIconStyle} />
                  <span>Vulnerabilities</span>
                  {vulnsLoad && <Spinner />}
                  {vulnsLoaded.has(h.id) && !vulnsLoad && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({vulns.length})</span>}
                </div>
                {vulnsExp && (
                  <>
                    {vulnsLoad ? (
                      <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                    ) : (
                      [...vulns].sort(compareBySeverity).map((v) => {
                        const isSel = selectedNode?.type === "vuln-instance" && selectedNode.id === v.id;
                        const effSev = getEffectiveSeverity(v);
                        return (
                          <div
                            key={v.id}
                            className={"theme-tree-node" + (isSel ? " selected" : "")}
                            style={{ ...nodeStyle(baseDepth + 2), color: getSeverityColor(effSev) }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedNode({ type: "vuln-instance", id: v.id });
                            }}
                            onContextMenu={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setContextMenu({
                                x: ev.clientX,
                                y: ev.clientY,
                                items: [
                                  { label: "Edit", onClick: () => setVulnModal({ mode: "edit", host: h, vuln: v }) },
                                  { label: "Delete", onClick: () => setDeleteVulnModal({ instance: v }) },
                                ],
                              });
                            }}
                          >
                            <span style={{ width: 14 }}>•</span>
                            {v.definition_title ?? v.id.slice(0, 8)}
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}> [{v.status}]</span>
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderDetailPane = () => {
    if (noteModal) {
      const contextLabel =
        noteModal.target === "scope"
          ? "Scope"
          : noteModal.target === "subnet" && noteModal.subnet
            ? `Subnet: ${noteModal.subnet.cidr}${noteModal.subnet.name ? ` (${noteModal.subnet.name})` : ""}`
            : noteModal.target === "port" && noteModal.port && noteModal.host
              ? `Port: ${noteModal.port.number}/${noteModal.port.protocol} on ${hostLabel(noteModal.host)}`
              : noteModal.target === "evidence" && noteModal.evidence
                ? `Report: ${noteModal.evidence.caption || noteModal.evidence.filename}`
                : noteModal.target === "host_ports" && noteModal.host
                  ? `Ports on ${hostLabel(noteModal.host)}`
                  : noteModal.target === "vulnerabilities"
                    ? "Vulnerabilities"
                    : noteModal.target === "vulnerability_definition" && noteModal.definition
                      ? `Vulnerability: ${noteModal.definition.title}`
                      : noteModal.host
                        ? `Host: ${hostLabel(noteModal.host)}`
                        : "";
      const targetId =
        noteModal.target === "scope"
          ? missionId
          : noteModal.target === "subnet"
            ? noteModal.subnet!.id
            : noteModal.target === "port"
              ? noteModal.port!.id
              : noteModal.target === "evidence"
                ? noteModal.evidence!.id
                : noteModal.target === "host_ports" && noteModal.host
                  ? noteModal.host.id
                  : noteModal.target === "vulnerabilities"
                    ? ""
                    : noteModal.target === "vulnerability_definition" && noteModal.definition
                      ? noteModal.definition.id
                      : noteModal.host!.id;
      return (
        <NoteEditorPanel
          contextLabel={contextLabel}
          note={noteModal.note}
          onClose={() => setNoteModal(null)}
          onSave={(title, bodyMd, attachments) => handleSaveNote(noteModal.target, targetId, title, bodyMd, attachments, noteModal.note)}
        />
      );
    }
    if (!selectedNode) {
      return (
        <div style={{ padding: 24 }}>
          <p style={{ color: "var(--text-muted)" }}>Select a node from the tree. Right-click for actions.</p>
        </div>
      );
    }
    if (selectedNode.type === "tool-runs") {
      const formatToolRunDetails = (details: Record<string, unknown>, actionType: string): string => {
        const parts: string[] = [];
        if (details.source_file) parts.push(`File: ${String(details.source_file)}`);
        if (details.source_dir) parts.push(`Dir: ${String(details.source_dir)}`);
        if (details.scan_start) parts.push(`Scan start: ${String(details.scan_start)}`);
        if (details.scan_end) parts.push(`Scan end: ${String(details.scan_end)}`);
        if (details.first_task_time != null) parts.push(`First task: ${String(details.first_task_time)}`);
        if (details.last_task_time != null) parts.push(`Last task: ${String(details.last_task_time)}`);
        if (details.hosts_created != null) parts.push(`Hosts created: ${String(details.hosts_created)}`);
        if (details.hosts_updated != null) parts.push(`Hosts updated: ${String(details.hosts_updated)}`);
        if (details.ports_created != null) parts.push(`Ports created: ${String(details.ports_created)}`);
        if (details.ports_updated != null) parts.push(`Ports updated: ${String(details.ports_updated)}`);
        if (details.screenshots_imported != null) parts.push(`Screenshots: ${String(details.screenshots_imported)}`);
        if (details.metadata_records_imported != null) parts.push(`Metadata: ${String(details.metadata_records_imported)}`);
        return parts.length ? parts.join(" · ") : actionType;
      };
      const formatTs = (ts: string) => {
        try {
          const d = new Date(ts);
          return `${ts} (${d.toLocaleString()})`;
        } catch {
          return ts;
        }
      };
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Tool runs</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>When imports (Nmap, Masscan, GoWitness, Text) were run for this mission.</p>
          {toolRunsLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : toolRunsEvents.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No tool runs recorded yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>Time</th>
                    <th style={{ padding: "8px 12px" }}>Tool</th>
                    <th style={{ padding: "8px 12px" }}>Phase</th>
                    <th style={{ padding: "8px 12px" }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {toolRunsEvents.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 12 }} title={ev.timestamp}>{formatTs(ev.timestamp)}</td>
                      <td style={{ padding: "8px 12px" }}>{ev.tool === "nmap" ? "Nmap" : ev.tool === "gowitness" ? "GoWitness" : ev.tool === "text" ? "Text" : ev.tool === "masscan" ? "Masscan" : ev.tool}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>{ev.action_type.includes("started") ? "Started" : "Completed"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-muted)" }}>{formatToolRunDetails(ev.details, ev.action_type)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }
    if (selectedNode.type === "tag") {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>Tag: {selectedNode.tagName}</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Right-click this tag in the tree to remove it from the item.</p>
        </div>
      );
    }
    if (selectedNode.type === "tags") {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>Tags</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
            Mission tags. Expand to see all tags. Click a tag to filter the tree so only hosts with that tag are shown.
          </p>
          {projectTags.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No tags yet. Right-click a host, port, evidence, or vulnerability and choose &quot;Add tag&quot; to create one.</p>
          )}
        </div>
      );
    }
    if (selectedNode.type === "tag-filter") {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>Tag: {selectedNode.tagName}</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
            Showing only hosts (and their ports, evidence, vulns) that have this tag. {effectiveVisibleHostCount} host{effectiveVisibleHostCount !== 1 ? "s" : ""} match.
          </p>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setSelectedNode(null)}>
            Clear tag filter
          </button>
        </div>
      );
    }
    if (selectedNode.type === "vulnerabilities") {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Vulnerabilities</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Right-click to add a vulnerability. Select one from the tree to view details.</p>
          {vulnDefinitionsLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : vulnDefinitions.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No vulnerabilities yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...vulnDefinitions].sort((a, b) => compareBySeverity({ definition_severity: a.severity, definition_cvss_score: a.cvss_score }, { definition_severity: b.severity, definition_cvss_score: b.cvss_score })).map((d) => (
                <li
                  key={d.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "vuln-definition", id: d.id })}
                >
                  <strong>{d.title}</strong>
                  <SeverityBadge severity={getEffectiveSeverity({ definition_severity: d.severity, definition_cvss_score: d.cvss_score })} compact />
                  <span onClick={(e) => e.stopPropagation()}>
                    <AffectedHostBadge count={d.affected_host_ids.length} onClick={() => setManageAffectedHostsModal(d)} compact />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "vuln-definition") {
      const def = vulnDefinitions.find((d) => d.id === selectedNode.id);
      if (!def) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Vulnerability not found.</div>;
      const defVulnLike: VulnLike = { definition_severity: def.severity, definition_cvss_score: def.cvss_score };
      const effSev = getEffectiveSeverity(defVulnLike);
      const isManualOverride = hasManualSeverityOverride(defVulnLike);
      const vulnLock = getLockForRecord("vulnerability_definition", def.id);
      const lockedByOther = vulnLock && vulnLock.locked_by_user_id !== currentUserId;
      const affectedHosts = def.affected_host_ids.map((hid) => hosts.find((h) => h.id === hid)).filter(Boolean) as Host[];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{def.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <SeverityBadge severity={effSev} />
            {isManualOverride && <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Manually set</span>}
            {def.cvss_score != null && <span style={{ fontSize: 14 }}>CVSS {def.cvss_score}{isManualOverride ? " (overridden)" : ""}</span>}
            {def.cve_ids?.length ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{def.cve_ids.join(", ")}</span> : null}
          </div>
          {lockedByOther && <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>Locked by {vulnLock!.locked_by_username ?? "Unknown"}</p>}
          {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ fontSize: "1rem", margin: 0 }}>Affected hosts</h3>
            <AffectedHostBadge count={def.affected_host_ids.length} onClick={() => setManageAffectedHostsModal(def)} />
          </div>
          {(def.affected_subnet_ids?.length ?? 0) > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Applied to subnet(s): {subnets.filter((s) => def.affected_subnet_ids?.includes(s.id)).map((s) => s.cidr).join(", ")}
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {affectedHosts.map((h) => (
              <li key={h.id} style={{ marginBottom: 4 }}>
                <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "4px 0", textAlign: "left" }} onClick={() => setSelectedNode({ type: "host", id: h.id })}>
                  {hostLabel(h)}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Discovered by: {def.discovered_by ?? "—"}</div>
            <div>First seen: {formatDate(def.created_at ?? null)}</div>
            <div>Last updated: {formatDate(def.updated_at ?? null)}</div>
          </div>
          {(def.description_md ?? "").trim() ? (
            <div className="note-markdown-content" style={{ lineHeight: 1.6, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(def.description_md ?? "") || "" }} />
          ) : null}
          {(def.evidence_md ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Reports / notes</h3>
              <div className="note-markdown-content" style={{ lineHeight: 1.6, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(def.evidence_md ?? "") || "" }} />
            </>
          ) : null}
          <VulnAttachmentsSection vulnDefId={def.id} canEdit={!lockedByOther} onRefresh={refreshVulnDefinitions} />
        </div>
      );
    }
    if (selectedNode.type === "port-evidence") {
      const evList = evidenceByPort[selectedNode.portId] ?? [];
      const ev = evList.find((e) => e.id === selectedNode.id);
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      const port = host ? (portsByHost[host.id] ?? []).find((p) => p.id === selectedNode.portId) : null;
      if (!ev || !host) return null;
      const isImage = !!(ev.mime && ev.mime.toLowerCase().startsWith("image/"));
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{ev.caption || ev.filename}</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
            {hostLabel(host)} • {port ? `${port.number}/${port.protocol}` : ""}
          </p>
          {isImage ? (
            <a href={apiUrl(`/api/ports/${selectedNode.portId}/attachments/${ev.id}`)} target="_blank" rel="noopener noreferrer">
              <img
                src={apiUrl(`/api/ports/${selectedNode.portId}/attachments/${ev.id}`)}
                alt={ev.caption || ev.filename}
                style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </a>
          ) : (
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>{ev.caption || ev.filename}</div>
          )}
        </div>
      );
    }
    if (selectedNode.type === "resolved")
      return <div style={{ padding: 24, color: "var(--text-muted)" }}>Resolved hosts (with IP). Expand to see subnets and hosts.</div>;
    if (selectedNode.type === "unresolved")
      return <div style={{ padding: 24, color: "var(--text-muted)" }}>Hosts with DNS but unresolved IP. Expand to see hosts.</div>;
    if (selectedNode.type === "out-of-scope")
      return (
        <div style={{ padding: 24, color: "var(--text-muted)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem", color: "var(--text-muted)" }}>Out of scope</h2>
          <p style={{ margin: 0 }}>Subnets and hosts moved out of scope appear here. Right-click an item to move it back into scope.</p>
        </div>
      );
    if (selectedNode.type === "custom-reports")
      return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>Select Report builder, Predefined reports, or a saved report from the list.</div>;
    if (selectedNode.type === "report-builder")
      return <CustomReportsPanel projectId={missionId} subnets={subnets} onToast={setToast} savedReports={savedReports} onSavedReportsChange={loadSavedReports} mode="builder" />;
    if (selectedNode.type === "predefined-reports")
      return <CustomReportsPanel projectId={missionId} subnets={subnets} onToast={setToast} savedReports={savedReports} onSavedReportsChange={loadSavedReports} mode="predefined" />;
    if (selectedNode.type === "saved-report") {
      const sr = savedReports.find((r) => r.id === selectedNode.id);
      if (!sr) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Saved report not found.</div>;
      return (
        <SavedReportRunView
          projectId={missionId}
          report={sr}
          onToast={setToast}
        />
      );
    }
    if (selectedNode.type === "tools-diff") return <ToolsDiffPanel />;
    if (selectedNode.type === "tools-decoder-base") return <ToolsDecoderPanel variant="base" />;
    if (selectedNode.type === "tools-decoder-xor") return <ToolsDecoderPanel variant="xor" />;
    if (selectedNode.type === "tools-decoder-jwt") return <ToolsDecoderPanel variant="jwt" />;
    if (selectedNode.type === "tools-decoder-url") return <ToolsDecoderPanel variant="url" />;
    if (selectedNode.type === "tools-deduplication") return <ToolsDeduplicationPanel />;
    if (selectedNode.type === "tools-prettify-json") return <ToolsPrettifyPanel variant="json" />;
    if (selectedNode.type === "tools-prettify-javascript") return <ToolsPrettifyPanel variant="javascript" />;
    if (selectedNode.type === "todos")
      return (
        <TodosPanel
          projectId={missionId}
          onToast={setToast}
          refreshTrigger={todosVersion}
          subnets={subnets}
          hosts={hosts}
          portsByHost={portsByHost}
          users={users}
          onFocusNode={(node) => {
            setExpanded((prev) => {
              const next = new Set(prev);
              if (node.type === "subnet") {
                const s = subnets.find((x) => x.id === node.id);
                if (s?.in_scope === false) next.add("out-of-scope"); else { next.add("scope"); next.add("resolved"); }
                next.add(`subnet:${node.id}`);
              } else if (node.type === "host") {
                const h = hosts.find((x) => x.id === node.id);
                if (h?.in_scope === false) next.add("out-of-scope"); else { next.add("scope"); next.add("resolved"); }
                if (h?.subnet_id) next.add(`subnet:${h.subnet_id}`);
                next.add(`host:${node.id}`);
                next.add(`host-ports:${node.id}`);
              } else if (node.type === "port") {
                const port = Object.entries(portsByHost).flatMap(([hid, list]) => list.map((p) => ({ hostId: hid, port: p }))).find((x) => x.port.id === node.id);
                if (port) {
                  const h = hosts.find((x) => x.id === port.hostId);
                  if (h?.in_scope === false) next.add("out-of-scope"); else { next.add("scope"); next.add("resolved"); }
                  if (h?.subnet_id) next.add(`subnet:${h.subnet_id}`);
                  next.add(`host:${port.hostId}`);
                  next.add(`host-ports:${port.hostId}`);
                } else {
                  next.add("scope");
                }
              }
              return next;
            });
            setSelectedNode(node.type === "subnet" ? { type: "subnet", id: node.id } : node.type === "host" ? { type: "host", id: node.id } : { type: "port", id: node.id });
          }}
        />
      );
    if (selectedNode.type === "todo") {
      const todo = projectTodos.find((t) => t.id === selectedNode.id);
      if (!todo) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Todo not found.</div>;
      const patchTodo = (updates: { status?: string; assigned_to_user_id?: string | null }) => {
        fetch(apiUrl(`/api/todos/${todo.id}`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Update failed"))))
          .then((t: ProjectTodo) => {
            setProjectTodos((prev) => prev.map((x) => (x.id === t.id ? t : x)));
            setToast(updates.status ? (updates.status === "done" ? "Marked done" : "Reopened") : "Assignee updated");
          })
          .catch(() => setToast("Update failed"));
      };
      const deleteTodo = () => {
        fetch(apiUrl(`/api/todos/${todo.id}`), { method: "DELETE", credentials: "include" })
          .then((r) => {
            if (!r.ok) throw new Error("Delete failed");
            setProjectTodos((prev) => prev.filter((t) => t.id !== todo.id));
            setSelectedNode(null);
            setToast("Todo deleted");
          })
          .catch(() => setToast("Delete failed"));
      };
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem", textDecoration: todo.status === "done" ? "line-through" : undefined }}>{todo.title}</h2>
          {todo.description && <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{todo.description}</p>}
          <div style={{ marginBottom: 16, fontSize: 14, color: "var(--text-muted)" }}>
            <label style={{ display: "block", marginBottom: 4 }}>Assign to</label>
            <select
              className="theme-select"
              value={todo.assigned_to_user_id ?? ""}
              onChange={(e) => patchTodo({ assigned_to_user_id: e.target.value || null })}
              style={{ maxWidth: 240 }}
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="theme-btn theme-btn-primary" onClick={() => patchTodo({ status: todo.status === "done" ? "open" : "done" })}>
              {todo.status === "done" ? "Reopen" : "Mark done"}
            </button>
            <button type="button" className="theme-btn theme-btn-ghost" style={{ color: "var(--error)" }} onClick={deleteTodo}>Delete</button>
          </div>
        </div>
      );
    }
    if (selectedNode.type === "subnet") {
      const subnet = subnets.find((s) => s.id === selectedNode.id);
      if (!subnet) return null;
      const subnetHosts = hostsBySubnet[subnet.id] ?? [];
      const subnetOwner = subnetHosts.map((h) => getWhoisOwner(h)).find((o) => o.length > 0) ?? "";
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>
            {subnet.cidr}
            {(subnet.name || subnetOwner) && (
              <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                ({subnet.name || subnetOwner})
              </span>
            )}
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{subnetHosts.length} host(s). Right-click for actions.</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {subnetHosts.map((h) => {
              const lock = getLockForRecord("host", h.id);
              return (
                <li key={h.id} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      backgroundColor: lock ? "var(--lock-bg)" : "var(--bg-panel)",
                      borderRadius: 8,
                      border: lock ? "1px solid var(--lock-border)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedNode({ type: "host", id: h.id })}
                  >
                    <ReachabilityDot status={getEffectiveHostStatus(h)} />
                    <span style={{ marginLeft: 8, fontWeight: 600 }}>{hostLabel(h)}</span>
                    {lock && <span style={{ fontSize: 12, color: "var(--accent)", marginLeft: 8 }}>Locked by {lock.locked_by_username ?? "?"}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {subnetHosts.length === 0 && <p style={{ color: "var(--text-muted)" }}>No hosts yet.</p>}
        </div>
      );
    }

    if (selectedNode.type === "host") {
      const host = hosts.find((h) => h.id === selectedNode.id);
      if (!host) return null;
      const allPorts = portsByHost[host.id] ?? [];
      const ports = allPorts;
      const allVulns = vulnsByHost[host.id] ?? [];
      const vulns = allVulns;
      const hostNotes = projectNotes.filter((n) => n.target_type === "host" && n.target_id === host.id);
      const hostTodos = projectTodos.filter((t) => t.target_type === "host" && t.target_id === host.id);
      const hostTags = getItemTagsFor("host", host.id);
      return (
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 8 }}>
            <ReachabilityDot status={getEffectiveHostStatus(host)} />
            <span style={{ marginLeft: 8, fontSize: "1.25rem", fontWeight: 600 }}>{host.ip}</span>
          </div>
          {host.dns_name ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{host.dns_name}</p>
          ) : (
            <p style={{ color: "var(--text-dim)", marginBottom: 16, fontStyle: "italic" }}>Unresolved</p>
          )}
          {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
          {currentHostLock && (
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>
              Locked by: {currentHostLock.locked_by_username ?? "Unknown"}
            </p>
          )}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Ports</h3>
          {portsLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Loading…</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {ports.length === 0 ? (
                <li style={{ color: "var(--text-muted)" }}>No ports.</li>
              ) : (
                ports.map((p) => (
                  <li key={p.id} style={{ marginBottom: 4 }}>
                    <button type="button" onClick={() => setSelectedNode({ type: "port", id: p.id })} className="theme-btn theme-btn-ghost" style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left" }}>
                      {p.number}/{p.protocol}{p.service_name ? ` (${p.service_name})` : ""}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Vulnerabilities</h3>
          {vulnsLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Loading…</p>
          ) : vulns.length === 0 ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>No vulnerabilities on this host.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {[...vulns].sort(compareBySeverity).map((v) => (
                <li
                  key={v.id}
                  style={{ marginBottom: 4, cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "vuln-instance", id: v.id })}
                >
                  <span style={{ color: getSeverityColor(getEffectiveSeverity(v)) }}>{v.definition_title ?? v.id}</span>{" "}
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>[{v.status}]</span>
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Notes</h3>
          {hostNotes.length === 0 ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>No notes on this host.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {hostNotes.map((n) => {
                const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                return (
                  <li key={n.id} style={{ marginBottom: 4 }}>
                    <button type="button" onClick={() => setSelectedNode({ type: "note", id: n.id, target: "host", targetId: host.id })} className="theme-btn theme-btn-ghost" style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left", fontStyle: "italic" }}>
                      {noteTitle}{noteTitle.length >= 40 ? "…" : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Todos</h3>
          {hostTodos.length === 0 ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>No todos on this host.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {hostTodos.map((t) => (
                <li key={t.id} style={{ marginBottom: 4, textDecoration: t.status === "done" ? "line-through" : undefined, color: "var(--text-muted)" }}>
                  <button type="button" onClick={() => setSelectedNode({ type: "todo", id: t.id })} className="theme-btn theme-btn-ghost" style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left" }}>
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Tags</h3>
          {hostTags.length === 0 ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>No tags on this host.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {hostTags.map((it) => (
                <span key={it.id} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12, color: it.tag_color ?? "var(--text-muted)" }}>
                  {it.tag_name ?? ""}
                </span>
              ))}
            </div>
          )}
          {host.whois_data && Object.keys(host.whois_data).length > 0 && (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Network / Whois</h3>
              <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {host.whois_data.asn_description != null && (
                  <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>Network:</strong> {String(host.whois_data.asn_description)}</div>
                )}
                {host.whois_data.network_name != null && host.whois_data.network_name !== host.whois_data.asn_description && (
                  <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>Name:</strong> {String(host.whois_data.network_name)}</div>
                )}
                {host.whois_data.asn != null && (
                  <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>ASN:</strong> {String(host.whois_data.asn)}</div>
                )}
                {(host.whois_data.asn_country != null || host.whois_data.country != null) && (
                  <div style={{ marginBottom: 4 }}>
                    <strong style={{ color: "var(--text)" }}>Country:</strong>{" "}
                    {[host.whois_data.asn_country, host.whois_data.country].filter(Boolean).join(" / ")}
                  </div>
                )}
                {host.whois_data.cidr != null && (
                  <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>CIDR:</strong> {String(host.whois_data.cidr)}</div>
                )}
                {host.whois_data.network_type != null && (
                  <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>Type:</strong> {String(host.whois_data.network_type)}</div>
                )}
                {host.whois_data.asn_registry != null && (
                  <div><strong style={{ color: "var(--text)" }}>Registry:</strong> {String(host.whois_data.asn_registry)}</div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    if (selectedNode.type === "host-ports") {
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      if (!host) return null;
      const allPorts = portsByHost[host.id] ?? [];
      const ports = allPorts;
      return (
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 8 }}>
            <ReachabilityDot status={getEffectiveHostStatus(host)} />
            <span style={{ marginLeft: 8, fontSize: "1.25rem", fontWeight: 600 }}>{host.ip}</span>
          </div>
          {host.dns_name && <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{host.dns_name}</p>}
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Ports</h3>
          {portsLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {ports.map((p) => (
                <li key={p.id} style={{ marginBottom: 4 }}>
                  <button type="button" onClick={() => setSelectedNode({ type: "port", id: p.id })} className="theme-btn theme-btn-ghost" style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left" }}>
                    {p.number}/{p.protocol}{p.service_name ? ` (${p.service_name})` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!portsLoading.has(host.id) && ports.length === 0 && <p style={{ color: "var(--text-muted)" }}>No ports.</p>}
        </div>
      );
    }

    if (selectedNode.type === "host-whois") {
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      if (!host) return null;
      const w = host.whois_data;
      if (!w || Object.keys(w).length === 0) {
        return (
          <div style={{ padding: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Whois — {host.ip}</h2>
            <p style={{ color: "var(--text-muted)" }}>No whois/RDAP data for this host. Import a whois JSON file to populate.</p>
          </div>
        );
      }
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Whois — {host.ip}</h2>
          <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
            {w.asn_description != null && (
              <div style={{ marginBottom: 8 }}><strong>Network:</strong> {String(w.asn_description)}</div>
            )}
            {w.network_name != null && w.network_name !== w.asn_description && (
              <div style={{ marginBottom: 8 }}><strong>Name:</strong> {String(w.network_name)}</div>
            )}
            {w.asn != null && (
              <div style={{ marginBottom: 8 }}><strong>ASN:</strong> {String(w.asn)}</div>
            )}
            {(w.asn_country != null || w.country != null) && (
              <div style={{ marginBottom: 8 }}>
                <strong>Country:</strong> {[w.asn_country, w.country].filter(Boolean).join(" / ")}
              </div>
            )}
            {w.cidr != null && (
              <div style={{ marginBottom: 8 }}><strong>CIDR:</strong> {String(w.cidr)}</div>
            )}
            {w.network_type != null && (
              <div style={{ marginBottom: 8 }}><strong>Type:</strong> {String(w.network_type)}</div>
            )}
            {w.asn_registry != null && (
              <div><strong>Registry:</strong> {String(w.asn_registry)}</div>
            )}
          </div>
        </div>
      );
    }

    if (selectedNode.type === "host-whois-field") {
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      if (!host) return null;
      const w = host.whois_data;
      const label = WHOIS_FIELD_LABELS[selectedNode.field] ?? selectedNode.field;
      const value = getWhoisDisplayValue(w, selectedNode.field);
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Whois — {label} — {host.ip}</h2>
          <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
            <strong>{label}:</strong> {value || "—"}
          </div>
        </div>
      );
    }

    if (selectedNode.type === "host-vulnerabilities") {
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      if (!host) return null;
      const vulns = vulnsByHost[host.id] ?? [];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Vulnerabilities — {host.ip}</h2>
          {vulnsLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : vulns.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No vulnerabilities on this host.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...vulns].sort(compareBySeverity).map((v) => (
                <li
                  key={v.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "vuln-instance", id: v.id })}
                >
                  <strong>{v.definition_title ?? v.id}</strong> <span style={{ color: "var(--text-muted)", fontSize: 12 }}>[{v.status}]</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "note") {
      const note = projectNotes.find((n) => n.id === selectedNode.id);
      if (!note) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Note not found.</div>;
      const contextLabel =
        selectedNode.target === "scope"
          ? "Scope"
          : selectedNode.target === "subnet"
            ? (() => {
                const s = subnets.find((x) => x.id === selectedNode.targetId);
                return s ? `Subnet: ${s.cidr}${s.name ? ` (${s.name})` : ""}` : "Subnet";
              })()
            : selectedNode.target === "port"
              ? (() => {
                  const port = Object.values(portsByHost).flat().find((p) => p.id === selectedNode.targetId);
                  const host = port ? hosts.find((h) => (portsByHost[h.id] ?? []).some((p) => p.id === port.id)) : null;
                  return port && host ? `Port: ${port.number}/${port.protocol} on ${hostLabel(host)}` : "Port";
                })()
              : selectedNode.target === "evidence"
                ? (() => {
                    const ev = Object.values(evidenceByPort).flat().find((e) => e.id === selectedNode.targetId);
                    return ev ? `Report: ${ev.caption || ev.filename}` : "Report";
                  })()
                : selectedNode.target === "host_ports"
                  ? (() => {
                      const h = hosts.find((x) => x.id === selectedNode.targetId);
                      return h ? `Ports on ${hostLabel(h)}` : "Ports";
                    })()
                  : selectedNode.target === "vulnerabilities"
                    ? "Vulnerabilities"
                    : selectedNode.target === "vulnerability_definition"
                      ? (() => {
                          const d = vulnDefinitions.find((x) => x.id === selectedNode.targetId);
                          return d ? `Vulnerability: ${d.title}` : "Vulnerability";
                        })()
                      : (() => {
                          const h = hosts.find((x) => x.id === selectedNode.targetId);
                          return h ? `Host: ${hostLabel(h)}` : "Host";
                        })();
      const noteLock = getLockForRecord("note", note.id);
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{note.title || "Untitled Note"}</h2>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>
            {contextLabel}
          </p>
          {noteLock && noteLock.locked_by_user_id !== currentUserId && (
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>Locked by {noteLock.locked_by_username ?? "Unknown"}</p>
          )}
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Created by {note.created_by ?? "Unknown"} on {formatDate(note.created_at ?? null)}</div>
            <div>Last updated by {note.updated_by ?? "Unknown"} on {formatDate(note.updated_at ?? null)}</div>
          </div>
          <div
            className="note-markdown-content"
            style={{ lineHeight: 1.6, marginBottom: 24 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body_md ?? "") || "<em>No content</em>" }}
          />
          {(note.attachments ?? []).length > 0 && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Attachments</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {(note.attachments ?? []).map((a) =>
                  a.type.startsWith("image/") ? (
                    <div key={a.id}>
                      <img src={a.url} alt={a.filename} style={{ maxWidth: 200, maxHeight: 150, objectFit: "contain", borderRadius: 6, border: "1px solid var(--border)" }} />
                      <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>{a.filename}</div>
                    </div>
                  ) : (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="theme-link" style={{ display: "block" }}>
                      {a.filename}
                    </a>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (selectedNode.type === "vuln-instance") {
      const vuln = Object.values(vulnsByHost).flat().find((v) => v.id === selectedNode.id);
      if (!vuln) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Select a vulnerability from the tree.</div>;
      const host = hosts.find((h) => h.id === vuln.host_id);
      const defFromList = vulnDefinitions.find((d) => d.id === vuln.vulnerability_definition_id);
      const affectedHosts = (defFromList?.affected_host_ids ?? [vuln.host_id]).map((hid) => hosts.find((h) => h.id === hid)).filter(Boolean) as Host[];
      const vulnLock = getLockForRecord("vulnerability_definition", vuln.vulnerability_definition_id);
      const lockedByOther = vulnLock && vulnLock.locked_by_user_id !== currentUserId;
      const effSev = getEffectiveSeverity(vuln);
      const isManualOverride = hasManualSeverityOverride(vuln);
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{vuln.definition_title ?? vuln.id}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <SeverityBadge severity={effSev} />
            {isManualOverride && <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Manually set</span>}
            {vuln.definition_cvss_score != null && <span style={{ fontSize: 14 }}>CVSS {vuln.definition_cvss_score}{isManualOverride ? " (overridden)" : ""}</span>}
            {vuln.definition_cve_ids?.length ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{vuln.definition_cve_ids.join(", ")}</span> : null}
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>[{vuln.status}]</span>
          </div>
          {lockedByOther && <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>Locked by {vulnLock!.locked_by_username ?? "Unknown"}</p>}
          {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Affected hosts</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {affectedHosts.map((h) => (
              <li key={h.id} style={{ marginBottom: 4 }}>
                <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "4px 0", textAlign: "left" }} onClick={() => setSelectedNode({ type: "host", id: h.id })}>
                  {hostLabel(h)}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Discovered by: {vuln.definition_discovered_by ?? "—"}</div>
            <div>First seen: {formatDate(vuln.definition_created_at ?? vuln.created_at ?? null)}</div>
            <div>Last updated: {formatDate(vuln.definition_updated_at ?? vuln.updated_at ?? null)}</div>
          </div>
          {(vuln.definition_description_md ?? "").trim() ? (
            <div className="note-markdown-content" style={{ lineHeight: 1.6, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(vuln.definition_description_md ?? "") || "" }} />
          ) : null}
          {((vuln.definition_evidence_md ?? vuln.notes_md) ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Reports / notes</h3>
              <div className="note-markdown-content" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown((vuln.definition_evidence_md ?? vuln.notes_md) ?? "") || "" }} />
            </>
          ) : null}
        </div>
      );
    }

    if (selectedNode.type === "port") {
      let port: Port | null = null;
      let host: Host | null = null;
      for (const h of hosts) {
        const found = (portsByHost[h.id] ?? []).find((p) => p.id === selectedNode.id);
        if (found) {
          port = found;
          host = h;
          break;
        }
      }
      if (!port || !host) return null;
      const portLock = getLockForRecord("port", port.id);
      const lockedByOther = portLock && portLock.locked_by_user_id !== currentUserId;
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{port.number}/{port.protocol}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Host: {hostLabel(host)}</span>
            <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 4, backgroundColor: "var(--bg-panel)", border: "1px solid var(--border)" }}>
              {port.state ?? "unknown"}
            </span>
            {port.service_name && (
              <span style={{ fontSize: 14 }}>Service: {port.service_name}</span>
            )}
          </div>
          {lockedByOther && (
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>
              Locked by {portLock!.locked_by_username ?? "Unknown"}
            </p>
          )}
          {lockError && (
            <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>
          )}
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Discovered by: {port.discovered_by ?? "—"}</div>
            <div>First seen: {formatDate(port.created_at ?? null)}</div>
            <div>Last updated: {formatDate(port.updated_at ?? null)}</div>
            {port.scanned_at && <div>Scanned at: {formatDate(port.scanned_at)}</div>}
          </div>
          {port.scan_metadata && Object.keys(port.scan_metadata).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Scan metadata</h3>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {"state_reason" in port.scan_metadata && port.scan_metadata.state_reason != null && (
                  <div style={{ marginBottom: 4 }}>State reason: {String(port.scan_metadata.state_reason)}{"state_reason_ttl" in port.scan_metadata && port.scan_metadata.state_reason_ttl != null ? ` (TTL ${port.scan_metadata.state_reason_ttl})` : ""}</div>
                )}
                {"service_conf" in port.scan_metadata && port.scan_metadata.service_conf != null && (
                  <div style={{ marginBottom: 4 }}>Confidence: {String(port.scan_metadata.service_conf)}</div>
                )}
                {"nmap_args" in port.scan_metadata && port.scan_metadata.nmap_args != null && (
                  <div style={{ marginBottom: 4 }}>Command: <code style={{ fontSize: 11, wordBreak: "break-all" }}>{String(port.scan_metadata.nmap_args)}</code></div>
                )}
                {("scan_start" in port.scan_metadata && port.scan_metadata.scan_start != null) || ("scan_end" in port.scan_metadata && port.scan_metadata.scan_end != null) ? (
                  <div style={{ marginBottom: 4 }}>
                    Run times: {port.scan_metadata.scan_start != null ? String(port.scan_metadata.scan_start) : "—"} to {port.scan_metadata.scan_end != null ? String(port.scan_metadata.scan_end) : "—"}
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {(port.description_md ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Description</h3>
              <div
                className="note-markdown-content"
                style={{ lineHeight: 1.6, marginBottom: 24 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(port.description_md ?? "") || "<em>No description</em>" }}
              />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontStyle: "italic", marginBottom: 24 }}>No description. Right-click the port in the tree to edit.</p>
          )}
          {(port.evidence_md ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Reports / Notes</h3>
              <div
                className="note-markdown-content"
                style={{ lineHeight: 1.6, marginBottom: 24 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(port.evidence_md ?? "") }}
              />
            </>
          ) : null}
          {(() => {
            const evList = evidenceByPort[port.id] ?? [];
            const screenshots = evList.filter(
              (e) => (e.source || "").toLowerCase() === "gowitness" && e.mime && e.mime.toLowerCase().startsWith("image/")
            );
            const metadataItems = evList.filter(
              (e) => (e.source || "").toLowerCase() === "gowitness" && (!e.mime || !e.mime.toLowerCase().startsWith("image/"))
            );
            const hasEvidence = screenshots.length > 0 || metadataItems.length > 0;
            if (!hasEvidence) return null;
            return (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Reports</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {metadataItems.map((ev) => {
                    const evNotes = projectNotes.filter((n) => n.target_type === "evidence" && n.target_id === ev.id);
                    return (
                      <div key={ev.id} style={{ padding: "8px 12px", backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{ev.caption || ev.filename}</span>
                        {(ev.source_timestamp ?? ev.imported_at ?? ev.created_at) && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                            {ev.source_timestamp ? `Scanned at: ${ev.source_timestamp}` : ev.imported_at ? `Imported at: ${formatDate(ev.imported_at)}` : `Created: ${formatDate(ev.created_at)}`}
                          </div>
                        )}
                        {evNotes.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {evNotes.map((n) => (
                              <div key={n.id} style={{ marginBottom: 8, padding: "8px 12px", backgroundColor: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                                <div className="note-markdown-content" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body_md ?? "") }} />
                                {!lockedByOther && (
                                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                                    <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11 }} onClick={() => setNoteModal({ mode: "edit", target: "evidence", evidence: ev, note: n })}>Edit</button>
                                    <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11, color: "var(--error)" }} onClick={() => setDeleteNoteModal({ note: n, target: "evidence", evidence: ev })}>Delete</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!lockedByOther && (
                          <div style={{ marginTop: 8 }}>
                            <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={() => setNoteModal({ mode: "add", target: "evidence", evidence: ev })}>
                              Add note
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {screenshots.map((ev) => {
                    const evNotes = projectNotes.filter((n) => n.target_type === "evidence" && n.target_id === ev.id);
                    return (
                      <div key={ev.id}>
                        <a
                          href={apiUrl(`/api/ports/${port.id}/attachments/${ev.id}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "block" }}
                        >
                          <img
                            src={apiUrl(`/api/ports/${port.id}/attachments/${ev.id}`)}
                            alt={ev.caption || ev.filename}
                            style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
                          />
                        </a>
                        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                          {ev.caption}
                          {(ev.source_timestamp ?? ev.imported_at) && (
                            <span style={{ display: "block", marginTop: ev.caption ? 4 : 0 }}>
                              {ev.source_timestamp ? `Scanned at: ${ev.source_timestamp}` : ev.imported_at ? `Imported at: ${formatDate(ev.imported_at)}` : null}
                            </span>
                          )}
                        </p>
                        {evNotes.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {evNotes.map((n) => (
                              <div key={n.id} style={{ marginBottom: 8, padding: "8px 12px", backgroundColor: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                                <div className="note-markdown-content" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body_md ?? "") }} />
                                {!lockedByOther && (
                                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                                    <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11 }} onClick={() => setNoteModal({ mode: "edit", target: "evidence", evidence: ev, note: n })}>Edit</button>
                                    <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11, color: "var(--error)" }} onClick={() => setDeleteNoteModal({ note: n, target: "evidence", evidence: ev })}>Delete</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!lockedByOther && (
                          <div style={{ marginTop: 8 }}>
                            <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={() => setNoteModal({ mode: "add", target: "evidence", evidence: ev })}>
                              Add note
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <PortAttachmentsSection
            portId={port.id}
            canEdit={!lockedByOther}
            onRefresh={() => {
              loadPortsForHost(host.id);
              setEvidenceLoaded((p) => { const n = new Set(p); n.delete(port.id); return n; });
              setEvidenceByPort((prev) => { const next = { ...prev }; delete next[port.id]; return next; });
              loadEvidenceForPort(port.id);
            }}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 57px)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 24px", backgroundColor: "var(--bg-panel)", color: "var(--text)", fontSize: 14, flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, color: scopeSeverity ? getSeverityColor(scopeSeverity) : undefined }}>{mission.name}</span>
        <span>Start: {formatDate(mission.start_date)}</span>
        <span>End: {formatDate(mission.end_date)}</span>
        <span>{daysRemaining(mission.end_date)} left</span>
        <Link href="/missions" className="theme-link" style={{ marginLeft: "auto" }}>Switch mission</Link>
      </div>
      <div ref={containerRef} style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <aside style={treeStyle}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "var(--bg-panel)", borderRadius: 6, border: "1px solid var(--border)", padding: "4px 8px" }}>
              <Search style={{ width: 16, height: 16, opacity: 0.9, flexShrink: 0 }} title="Filter" />
              <input
                type="text"
                className="theme-input"
                placeholder="Filter hosts, ports, reports…"
                value={treeFilterInput}
                onChange={(e) => setTreeFilterInput(e.target.value)}
                style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, minWidth: 0 }}
              />
              {treeFilterInput.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTreeFilterInput("")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 4px", fontSize: 14 }}
                  title="Clear filter"
                  aria-label="Clear filter"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilterHelpOpen((v) => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", color: filterHelpOpen ? "var(--accent)" : "var(--text-muted)", padding: "0 4px", fontSize: 14, fontWeight: 600 }}
                title="Filter help"
                aria-label="Filter help"
              >
                ?
              </button>
            </div>
            {(filterActive || tagFilterActive) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                <span style={{ backgroundColor: "var(--accent)", color: "var(--bg)", padding: "2px 6px", borderRadius: 4 }}>Filtered</span>
                {tagFilterActive && activeTagFilter && (
                  <>
                    <span style={{ color: "var(--text)" }}>Tag: {activeTagFilter.tagName}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTagFilterState(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 2px", fontSize: 12 }}
                      title="Clear tag filter"
                      aria-label="Clear tag filter"
                    >
                      ✕
                    </button>
                  </>
                )}
                <span>{effectiveVisibleHostCount} of {hosts.length} hosts</span>
              </div>
            )}
          </div>
          <div
            className="theme-tree-node"
            style={{ ...nodeStyle(0), paddingLeft: 12, fontWeight: 600, color: scopeSeverity ? getSeverityColor(scopeSeverity) : "var(--text)" }}
            onClick={() => toggleExpand("scope")}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("scope") },
                  { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                  { label: "Add Subnet", onClick: () => setAddSubnetModal(true) },
                  { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "scope" }) },
                  { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "scope", contextLabel: "Scope" }) },
                  { label: "Import scan results", onClick: () => setImportHostsModal({ type: "scope" }) },
                ],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("scope") ? "▼" : "▶"}</span>
            <Globe style={navIconStyle} />
            Scope
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({hosts.length})</span>
          </div>
          {expanded.has("scope") && (
            <>
              {(() => {
                const scopeEmpty = !projectNotes.some((n) => n.target_type === "scope") && !projectTodos.some((t) => t.target_type === "scope") && inScopeSubnets.filter((s) => !filterActive && !tagFilterActive || effectiveMatchingSubnetIds.has(s.id)).length === 0 && (hostsBySubnet["_unresolved"] ?? []).filter((h) => h.in_scope !== false).length === 0 && (hostsBySubnet["_unassigned"] ?? []).filter((h) => h.in_scope !== false).length === 0 && outOfScopeSubnets.length === 0 && standaloneOutOfScopeHosts.length === 0;
                if (scopeEmpty) return <div className="theme-tree-node" style={{ ...nodeStyle(1), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>;
                return (
                  <>
              {projectNotes.filter((n) => n.target_type === "scope").map((n) => {
                  const isSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "scope";
                  const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                  return (
                    <div
                      key={n.id}
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={{ ...nodeStyle(1), color: "var(--text-muted)" }}
                      onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "scope", targetId: missionId }); }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setContextMenu({
                          x: ev.clientX,
                          y: ev.clientY,
                          items: [
                            { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "scope", note: n }) },
                            { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "scope" }) },
                            { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "scope" }) },
                          ],
                        });
                      }}
                    >
                      <span style={{ width: 14 }}>≡</span>
                      <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                    </div>
                  );
                })}
              {(() => {
                const scopeTodos = projectTodos.filter((t) => t.target_type === "scope");
                return scopeTodos.map((t) => {
                  const isSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                  return (
                    <div
                      key={t.id}
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={{ ...nodeStyle(1), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                      onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                    >
                      <span style={{ width: 14 }}>•</span>
                      {t.title}
                    </div>
                  );
                });
              })()}
              {/* Resolved: in-scope subnets + unassigned hosts */}
              <div>
                <div
                  className={"theme-tree-node" + (selectedNode?.type === "resolved" ? " selected" : "")}
                  style={{ ...nodeStyle(1), color: "var(--text)" }}
                  onClick={() => {
                    toggleExpand("resolved");
                    setSelectedNode({ type: "resolved" });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("resolved") },
                        { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                        ...scopeSortMenuItems,
                      ],
                    });
                  }}
                >
                  <span style={{ width: 14 }}>{expanded.has("resolved") ? "▼" : "▶"}</span>
                  Resolved
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({inScopeResolvedHostCount})</span>
                </div>
                {expanded.has("resolved") && (
                  <>
                    {inScopeSubnets.filter((s) => !filterActive && !tagFilterActive || effectiveMatchingSubnetIds.has(s.id)).length === 0 && (hostsBySubnet["_unassigned"] ?? []).filter((h) => h.in_scope !== false).length === 0 ? (
                      <div className="theme-tree-node" style={{ ...nodeStyle(2), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
                    ) : (
                      <>
              {inScopeSubnets.filter((s) => !filterActive && !tagFilterActive || effectiveMatchingSubnetIds.has(s.id)).map((s) => {
                const key = `subnet:${s.id}`;
                const isExp = expanded.has(key);
                const isSel = selectedNode?.type === "subnet" && selectedNode.id === s.id;
                const inScopeHostsInSubnet = (hostsBySubnet[s.id] ?? []).filter((h) => h.in_scope !== false);
                const subnetHosts = inScopeHostsInSubnet.filter((h) => !filterActive && !tagFilterActive || effectiveMatchingHostIds.has(h.id));
                const hostCount = filterActive ? subnetHosts.length : inScopeHostsInSubnet.length;
                const subnetOwner = subnetHosts.map((h) => getWhoisOwner(h)).find((o) => o.length > 0) ?? "";
                return (
                  <div key={s.id}>
                    <div
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={{ ...nodeStyle(2), color: subnetSeverity(s.id) ? getSeverityColor(subnetSeverity(s.id)) : "var(--text)" }}
                      onClick={() => { toggleExpand(key); setSelectedNode({ type: "subnet", id: s.id }); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedNode({ type: "subnet", id: s.id });
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            { label: "Expand/Collapse", onClick: () => toggleExpandCollapse(key) },
                            { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                            s.in_scope !== false
                              ? { label: "Move out of scope", onClick: () => handleMoveSubnetScope(s.id, false) }
                              : { label: "Move back into scope", onClick: () => handleMoveSubnetScope(s.id, true) },
                            { label: "Add Host", onClick: () => setAddHostModal({ subnetId: s.id }) },
                            { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "subnet", subnet: s }) },
                            { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "subnet", parentId: s.id, contextLabel: `Subnet ${s.cidr}${s.name ? ` (${s.name})` : ""}` }) },
                            { label: "Import scan results", onClick: () => setImportHostsModal({ type: "subnet", id: s.id, cidr: s.cidr, name: s.name }) },
                            { label: "Rename", onClick: () => setRenameSubnetModal(s) },
                            { label: "Delete", onClick: () => setDeleteSubnetModal(s) },
                          ].filter(Boolean),
                        });
                      }}
                    >
                      <span style={{ width: 14 }}>{isExp ? "▼" : "▶"}</span>
                      {s.cidr}
                      {(s.name || subnetOwner) && (
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                          ({s.name || subnetOwner})
                        </span>
                      )}
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({hostCount})</span>
                    </div>
                    {isExp && (
                      <>
                        {projectNotes.filter((n) => n.target_type === "subnet" && n.target_id === s.id).map((n) => {
                            const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "subnet" && selectedNode.targetId === s.id;
                            const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                            return (
                              <div
                                key={n.id}
                                className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                                style={{ ...nodeStyle(3), color: "var(--text-muted)" }}
                                onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "subnet", targetId: s.id }); }}
                                onContextMenu={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  setContextMenu({
                                    x: ev.clientX,
                                    y: ev.clientY,
                                    items: [
                                      { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "subnet", subnet: s, note: n }) },
                                      { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "subnet", subnet: s }) },
                                      { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "subnet", subnet: s }) },
                                    ],
                                  });
                                }}
                              >
                                <span style={{ width: 14 }}>≡</span>
                                <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                              </div>
                            );
                          })}
                        {projectTodos.filter((t) => t.target_type === "subnet" && t.target_id === s.id).map((t) => {
                          const isSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                          return (
                            <div
                              key={t.id}
                              className={"theme-tree-node" + (isSel ? " selected" : "")}
                              style={{ ...nodeStyle(3), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                              onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                            >
                              <span style={{ width: 14 }}>•</span>
                              {t.title}
                            </div>
                          );
                        })}
                        {subnetHosts.map((h) => renderTreeHost(h, 3))}
                      </>
                    )}
                  </div>
                );
              })}
              {/* Unassigned: in-scope hosts with real IP but no subnet */}
              {(filterActive || tagFilterActive ? [...effectiveMatchingUnassignedHostIds].map((id) => hosts.find((h) => h.id === id)).filter((h): h is Host => !!h && h.in_scope !== false) : (hostsBySubnet["_unassigned"] ?? []).filter((h) => h.in_scope !== false)).map((h) => (
                <div key={h.id}>{renderTreeHost(h, 2)}</div>
              ))}
                      </>
                    )}
                  </>
                )}
              </div>
              {/* Unresolved: in-scope hosts where DNS exists but IP is unresolved */}
              {(!filterActive && !tagFilterActive ? (hostsBySubnet["_unresolved"] ?? []).filter((h) => h.in_scope !== false).length > 0 : effectiveHasMatchingUnresolved) && (
                <div>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "unresolved" ? " selected" : "")}
                    style={{ ...nodeStyle(1), color: "var(--text-muted)", fontStyle: "italic" }}
                    onClick={() => {
                      toggleExpand("unresolved");
                      setSelectedNode({ type: "unresolved" });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                          { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("unresolved") },
                          { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                          ...scopeSortMenuItems,
                        ],
                      });
                    }}
                  >
                    <span style={{ width: 14 }}>{expanded.has("unresolved") ? "▼" : "▶"}</span>
                    Unresolved
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({(hostsBySubnet["_unresolved"] ?? []).filter((h) => h.in_scope !== false).length})</span>
                  </div>
                  {expanded.has("unresolved") &&
                    (hostsBySubnet["_unresolved"] ?? [])
                      .filter((h) => h.in_scope !== false)
                      .filter((h) => !filterActive && !tagFilterActive || effectiveMatchingHostIds.has(h.id))
                      .map((h) => (
                        <div key={h.id}>{renderTreeHost(h, 2)}</div>
                      ))}
                </div>
              )}
              {/* Out of scope: subnets and hosts moved out of scope */}
              <div
                className={"theme-tree-node" + (selectedNode?.type === "out-of-scope" ? " selected" : "")}
                style={{ ...nodeStyle(1), marginTop: 4, color: "var(--text-muted)" }}
                onClick={() => {
                  toggleExpand("out-of-scope");
                  setSelectedNode({ type: "out-of-scope" });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("out-of-scope") },
                      { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                      ...scopeSortMenuItems,
                    ],
                  });
                }}
              >
                <span style={{ width: 14 }}>{expanded.has("out-of-scope") ? "▼" : "▶"}</span>
                Out of scope
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({outOfScopeSubnets.length + standaloneOutOfScopeHosts.length})</span>
              </div>
              {expanded.has("out-of-scope") && (
                <>
                  {outOfScopeSubnets.map((s) => {
                    const key = `subnet:${s.id}`;
                    const isExp = expanded.has(key);
                    const isSel = selectedNode?.type === "subnet" && selectedNode.id === s.id;
                    const subnetHosts = hostsBySubnet[s.id] ?? [];
                    const subnetOwner = subnetHosts.map((h) => getWhoisOwner(h)).find((o) => o.length > 0) ?? "";
                    return (
                      <div key={s.id}>
                        <div
                          className={"theme-tree-node" + (isSel ? " selected" : "")}
                          style={{ ...nodeStyle(2), color: "var(--text-muted)" }}
                          onClick={() => { toggleExpand(key); setSelectedNode({ type: "subnet", id: s.id }); }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedNode({ type: "subnet", id: s.id });
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                            items: [
                            { label: "Expand/Collapse", onClick: () => toggleExpandCollapse(key) },
                            { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                            { label: "Move back into scope", onClick: () => handleMoveSubnetScope(s.id, true) },
                            { label: "Add Host", onClick: () => setAddHostModal({ subnetId: s.id }) },
                            { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "subnet", subnet: s }) },
                            { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "subnet", parentId: s.id, contextLabel: `Subnet ${s.cidr}${s.name ? ` (${s.name})` : ""}` }) },
                            { label: "Import scan results", onClick: () => setImportHostsModal({ type: "subnet", id: s.id, cidr: s.cidr, name: s.name }) },
                            { label: "Rename", onClick: () => setRenameSubnetModal(s) },
                            { label: "Delete", onClick: () => setDeleteSubnetModal(s) },
                          ].filter(Boolean),
                            });
                          }}
                        >
                          <span style={{ width: 14 }}>{isExp ? "▼" : "▶"}</span>
                          {s.cidr}
                          {(s.name || subnetOwner) && (
                            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>({s.name || subnetOwner})</span>
                          )}
                          <span style={{ color: "var(--text-dim)", fontSize: 11 }}> ({subnetHosts.length})</span>
                        </div>
                        {isExp && subnetHosts.map((h) => (
                          <div key={h.id}>{renderTreeHost(h, 3, true)}</div>
                        ))}
                      </div>
                    );
                  })}
                  {standaloneOutOfScopeHosts.map((h) => (
                    <div key={h.id}>{renderTreeHost(h, 2, true)}</div>
                  ))}
                </>
              )}
                  </>
                );
              })()}
            </>
          )}
          <div
            className={"theme-tree-node" + (selectedNode?.type === "vulnerabilities" ? " selected" : "")}
            style={{ ...nodeStyle(0), paddingLeft: 12 }}
            onClick={(ev) => {
              ev.stopPropagation();
              toggleExpand("vulnerabilities", () => loadVulnDefinitions());
              setSelectedNode({ type: "vulnerabilities" });
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (!vulnDefinitionsLoaded && !vulnDefinitionsLoading) loadVulnDefinitions();
              setContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                items: [
                  { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("vulnerabilities") },
                  { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                  { label: "Add Vulnerability", onClick: () => setVulnModal({ mode: "add" }) },
                  { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "vulnerabilities" }) },
                  { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "vulnerabilities", contextLabel: "Vulnerabilities" }) },
                ],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("vulnerabilities") ? "▼" : "▶"}</span>
            <TriangleAlert style={navIconStyle} />
            Vulnerabilities
            {vulnDefinitionsLoading && <Spinner />}
            {vulnDefinitionsLoaded && !vulnDefinitionsLoading && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({vulnDefinitions.length})</span>}
          </div>
          {expanded.has("vulnerabilities") && (
            <>
              {projectNotes.filter((n) => n.target_type === "vulnerabilities").map((n) => {
                const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "vulnerabilities";
                const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                return (
                  <div
                    key={n.id}
                    className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                    style={{ ...nodeStyle(1), color: "var(--text-muted)" }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "vulnerabilities", targetId: "" }); }}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setContextMenu({
                        x: ev.clientX,
                        y: ev.clientY,
                        items: [
                          { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "vulnerabilities", note: n }) },
                          { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "vulnerabilities" }) },
                          { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "vulnerabilities" }) },
                        ],
                      });
                    }}
                  >
                    <span style={{ width: 14 }}>≡</span>
                    <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                  </div>
                );
              })}
              {projectTodos.filter((t) => t.target_type === "vulnerabilities").map((t) => {
                const isSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={"theme-tree-node" + (isSel ? " selected" : "")}
                    style={{ ...nodeStyle(1), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                  >
                    <span style={{ width: 14 }}>•</span>
                    {t.title}
                  </div>
                );
              })}
              {vulnDefinitionsLoading ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), color: "var(--text-muted)" }}>Loading…</div>
              ) : vulnDefinitions.length === 0 ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
              ) : (
                [...vulnDefinitions].sort((a, b) => compareBySeverity({ definition_severity: a.severity, definition_cvss_score: a.cvss_score }, { definition_severity: b.severity, definition_cvss_score: b.cvss_score })).map((d) => {
                  const isSel = selectedNode?.type === "vuln-definition" && selectedNode.id === d.id;
                  const effSev = getEffectiveSeverity({ definition_severity: d.severity, definition_cvss_score: d.cvss_score });
                  return (
                    <div key={d.id}>
                      <div
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={{ ...nodeStyle(1), color: getSeverityColor(effSev) }}
                        onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "vuln-definition", id: d.id }); }}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          const editHost = hosts.find((x) => d.affected_host_ids?.includes(x.id));
                          setContextMenu({
                            x: ev.clientX,
                            y: ev.clientY,
                            items: [
                              { label: "Edit", onClick: () => setVulnModal({ mode: "edit", host: editHost ?? undefined, definition: d }) },
                              { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "vulnerability_definition", definition: d }) },
                              { label: "Add Todo", onClick: () => setAddTodoModal({ parentType: "vulnerability_definition", parentId: d.id, contextLabel: `Vulnerability: ${d.title}` }) },
                              { label: "Add tag", onClick: () => setAddTagModal({ targetType: "vuln_definition", targetId: d.id }) },
                              { label: "Delete", onClick: () => setDeleteVulnModal({ instance: { id: "", host_id: d.affected_host_ids?.[0] ?? "", vulnerability_definition_id: d.id, definition_title: d.title, definition_severity: d.severity, definition_cvss_score: d.cvss_score, definition_cve_ids: d.cve_ids ?? [], definition_description_md: d.description_md, definition_evidence_md: d.evidence_md, definition_discovered_by: d.discovered_by, port_id: null, status: "open" } }) },
                            ],
                          });
                        }}
                      >
                        <span style={{ width: 14 }}>•</span>
                        {d.title}
                        <AffectedHostBadge count={d.affected_host_ids.length} onClick={() => setManageAffectedHostsModal(d)} compact />
                      </div>
                      {getItemTagsFor("vuln_definition", d.id).map((it) => {
                        const isTagSel = selectedNode?.type === "tag" && selectedNode.itemTagId === it.id;
                        return (
                          <div
                            key={it.id}
                            className={"theme-tree-node" + (isTagSel ? " selected" : "")}
                            style={{ ...nodeStyle(2), color: it.tag_color ?? "var(--text-muted)" }}
                            onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tag", itemTagId: it.id, tagId: it.tag_id, tagName: it.tag_name ?? "", targetType: "vuln_definition", targetId: d.id }); }}
                            onContextMenu={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setContextMenu({
                                x: ev.clientX,
                                y: ev.clientY,
                                items: [{ label: "Remove tag", onClick: () => handleRemoveItemTag(it.id) }],
                              });
                            }}
                          >
                            <span style={{ width: 14 }}>🏷</span>
                            <span>{it.tag_name ?? ""}</span>
                          </div>
                        );
                      })}
                      {projectNotes.filter((n) => n.target_type === "vulnerability_definition" && n.target_id === d.id).map((n) => {
                        const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "vulnerability_definition";
                        const noteTitle = (n as Note & { title?: string }).title || (n.body_md?.split("\n")[0]?.slice(0, 40) ?? "Untitled");
                        return (
                          <div
                            key={n.id}
                            className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                            style={{ ...nodeStyle(2), color: "var(--text-muted)" }}
                            onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "note", id: n.id, target: "vulnerability_definition", targetId: d.id }); }}
                            onContextMenu={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setContextMenu({
                                x: ev.clientX,
                                y: ev.clientY,
                                items: [
                                  { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "vulnerability_definition", definition: d, note: n }) },
                                  { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "vulnerability_definition", definition: d }) },
                                  { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "vulnerability_definition", definition: d }) },
                                ],
                              });
                            }}
                          >
                            <span style={{ width: 14 }}>≡</span>
                            <span style={{ fontStyle: "italic" }}>{noteTitle}{noteTitle.length >= 40 ? "…" : ""}</span>
                          </div>
                        );
                      })}
                      {projectTodos.filter((t) => t.target_type === "vulnerability_definition" && t.target_id === d.id).map((t) => {
                        const isTodoSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                        return (
                          <div
                            key={t.id}
                            className={"theme-tree-node" + (isTodoSel ? " selected" : "")}
                            style={{ ...nodeStyle(2), color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                            onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                          >
                            <span style={{ width: 14 }}>•</span>
                            {t.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </>
          )}
          <div>
            <div
              className={"theme-tree-node" + (selectedNode?.type === "todos" ? " selected" : "")}
              style={{ ...nodeStyle(0), paddingLeft: 12 }}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpand("todos-root");
                setSelectedNode({ type: "todos" });
              }}
            >
              <span style={{ width: 14 }}>{expanded.has("todos-root") ? "▼" : "▶"}</span>
              <CheckSquare style={navIconStyle} />
              Todos
              {projectTodos.length > 0 && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({projectTodos.length})</span>}
            </div>
            {expanded.has("todos-root") && (
              projectTodos.length === 0 ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), paddingLeft: 12, color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
              ) : (
              projectTodos.map((t) => {
                const isSel = selectedNode?.type === "todo" && selectedNode.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={"theme-tree-node" + (isSel ? " selected" : "")}
                    style={{ ...nodeStyle(1), paddingLeft: 12, color: "var(--text-muted)", textDecoration: t.status === "done" ? "line-through" : undefined }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "todo", id: t.id }); }}
                  >
                    <span style={{ width: 14 }}>•</span>
                    {t.title}
                  </div>
                );
              })
              )
            )}
          </div>
          <div>
            <div
              className={"theme-tree-node" + (selectedNode?.type === "tags" ? " selected" : "")}
              style={{ ...nodeStyle(0), paddingLeft: 12 }}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpand("tags-root");
                setSelectedNode({ type: "tags" });
              }}
            >
              <span style={{ width: 14 }}>{expanded.has("tags-root") ? "▼" : "▶"}</span>
              <Hash style={navIconStyle} />
              Tags
              {projectTags.length > 0 && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({projectTags.length})</span>}
            </div>
            {expanded.has("tags-root") && (
              <>
                {projectTags.length === 0 ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), paddingLeft: 12, color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
              ) : (
                  projectTags.map((t) => {
                    const isSel = (selectedNode?.type === "tag-filter" && selectedNode.tagId === t.id) || activeTagFilterState?.tagId === t.id;
                    const count = (hostIdsByTagId[t.id] ?? new Set()).size;
                    return (
                      <div
                        key={t.id}
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={{ ...nodeStyle(1), paddingLeft: 12, color: t.color ?? "var(--text)" }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (isSel) {
                            setActiveTagFilterState(null);
                            setSelectedNode(null);
                          } else {
                            setActiveTagFilterState({ tagId: t.id, tagName: t.name });
                            setSelectedNode({ type: "tag-filter", tagId: t.id, tagName: t.name });
                          }
                        }}
                      >
                        <span style={{ width: 14 }}><Hash style={{ width: 12, height: 12, opacity: 0.9 }} /></span>
                        {t.name}
                        {count > 0 && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({count})</span>}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
          <div
            className={"theme-tree-node" + (selectedNode?.type === "custom-reports" ? " selected" : "")}
            style={{ ...nodeStyle(0), paddingLeft: 12 }}
            onClick={(ev) => {
              ev.stopPropagation();
              toggleExpand("custom-reports");
              setSelectedNode({ type: "custom-reports" });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("custom-reports") },
                  { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                ],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("custom-reports") ? "▼" : "▶"}</span>
            <FileText style={navIconStyle} />
            Custom Reports
            {savedReports.length > 0 && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({savedReports.length})</span>}
          </div>
          {expanded.has("custom-reports") && (
            <>
              <div
                className={"theme-tree-node" + (selectedNode?.type === "report-builder" ? " selected" : "")}
                style={nodeStyle(1)}
                onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "report-builder" }); }}
              >
                <span style={{ width: 14 }}>▶</span>
                Report builder
              </div>
              <div
                className={"theme-tree-node" + (selectedNode?.type === "predefined-reports" ? " selected" : "")}
                style={nodeStyle(1)}
                onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "predefined-reports" }); }}
              >
                <span style={{ width: 14 }}>▶</span>
                Predefined reports
              </div>
              {savedReports.length === 0 ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), color: "var(--text-dim)", fontStyle: "italic" }}>No saved reports</div>
              ) : (
              savedReports.map((sr) => {
                const isSel = selectedNode?.type === "saved-report" && selectedNode.id === sr.id;
                return (
                  <div
                    key={sr.id}
                    className={"theme-tree-node" + (isSel ? " selected" : "")}
                    style={{ ...nodeStyle(1), color: "var(--text-muted)" }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "saved-report", id: sr.id }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    {sr.name}
                  </div>
                );
              }              )
              )}
            </>
          )}
          <div
            className="theme-tree-node"
            style={{ ...nodeStyle(0), paddingLeft: 12 }}
            onClick={(ev) => {
              ev.stopPropagation();
              toggleExpand("tools");
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "Expand/Collapse", onClick: () => toggleExpandCollapse("tools") },
                  { label: "Expand All/Collapse All", onClick: () => toggleExpandCollapseAll() },
                ],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("tools") ? "▼" : "▶"}</span>
            <Wrench style={navIconStyle} />
            Tools
          </div>
          {expanded.has("tools") && (
            <>
              <div
                className={"theme-tree-node" + (selectedNode?.type === "tools-diff" ? " selected" : "")}
                style={nodeStyle(1)}
                onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-diff" }); }}
              >
                <span style={{ width: 14 }}>▶</span>
                <GitCompare style={navIconStyle} />
                Diff
              </div>
              <div
                className="theme-tree-node"
                style={nodeStyle(1)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggleExpand("tools-decoder");
                }}
              >
                <span style={{ width: 14 }}>{expanded.has("tools-decoder") ? "▼" : "▶"}</span>
                <ScanText style={navIconStyle} />
                Decoder
              </div>
              {expanded.has("tools-decoder") && (
                <>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "tools-decoder-base" ? " selected" : "")}
                    style={nodeStyle(2)}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-decoder-base" }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    <Layers style={navIconStyle} />
                    Base
                  </div>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "tools-decoder-jwt" ? " selected" : "")}
                    style={nodeStyle(2)}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-decoder-jwt" }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    <Key style={navIconStyle} />
                    JSON Webtoken
                  </div>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "tools-decoder-xor" ? " selected" : "")}
                    style={nodeStyle(2)}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-decoder-xor" }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    <Binary style={navIconStyle} />
                    XOR
                  </div>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "tools-decoder-url" ? " selected" : "")}
                    style={nodeStyle(2)}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-decoder-url" }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    <LinkIcon style={navIconStyle} />
                    URL
                  </div>
                </>
              )}
              <div
                className="theme-tree-node"
                style={nodeStyle(1)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggleExpand("tools-prettify");
                }}
              >
                <span style={{ width: 14 }}>{expanded.has("tools-prettify") ? "▼" : "▶"}</span>
                <Sparkles style={navIconStyle} />
                Prettify
              </div>
              {expanded.has("tools-prettify") && (
                <>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "tools-prettify-json" ? " selected" : "")}
                    style={nodeStyle(2)}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-prettify-json" }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    <Braces style={navIconStyle} />
                    JSON
                  </div>
                  <div
                    className={"theme-tree-node" + (selectedNode?.type === "tools-prettify-javascript" ? " selected" : "")}
                    style={nodeStyle(2)}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-prettify-javascript" }); }}
                  >
                    <span style={{ width: 14 }}>▶</span>
                    <Code style={navIconStyle} />
                    JavaScript
                  </div>
                </>
              )}
              <div
                className={"theme-tree-node" + (selectedNode?.type === "tools-deduplication" ? " selected" : "")}
                style={nodeStyle(1)}
                onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tools-deduplication" }); }}
              >
                <span style={{ width: 14 }}>▶</span>
                <ListFilter style={navIconStyle} />
                Deduplication
              </div>
              <div
                className={"theme-tree-node" + (selectedNode?.type === "tool-runs" ? " selected" : "")}
                style={nodeStyle(1)}
                onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "tool-runs" }); }}
              >
                <span style={{ width: 14 }}>▶</span>
                <Clock style={navIconStyle} />
                Tool runs
              </div>
            </>
          )}
        </aside>
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
          style={{
            width: 6,
            minWidth: 6,
            cursor: "col-resize",
            backgroundColor: isResizing ? "var(--accent)" : "transparent",
            flexShrink: 0,
            margin: 0,
          }}
          title="Drag to resize tree"
        />
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", backgroundColor: "var(--bg)", color: "var(--text)" }}>{renderDetailPane()}</main>
        {filterHelpOpen && (
          <FilterHelpPanel
            onClose={() => setFilterHelpOpen(false)}
            currentFilter={treeFilterInput}
            onApplyFilter={setTreeFilterInput}
            parseFilter={parseFilter}
          />
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {addTodoModal && (
        <AddTodoModal
          projectId={missionId}
          parentType={addTodoModal.parentType}
          parentId={addTodoModal.parentId ?? null}
          contextLabel={addTodoModal.contextLabel}
          users={users}
          onClose={() => setAddTodoModal(null)}
          onSaved={() => {
            setTodosVersion((v) => v + 1);
            const m = addTodoModal;
            if (!m) return;
            setExpanded((prev) => {
              const next = new Set(prev);
              next.add("todos-root");
              next.add("scope");
              if (m.parentType === "subnet" && m.parentId) {
                next.add("resolved");
                next.add(`subnet:${m.parentId}`);
              } else if (m.parentType === "host" && m.parentId) {
                next.add("resolved");
                const h = hosts.find((x) => x.id === m.parentId);
                if (h?.subnet_id) next.add(`subnet:${h.subnet_id}`);
                next.add(`host:${m.parentId}`);
              } else if (m.parentType === "host_ports" && m.parentId) {
                next.add("resolved");
                const h = hosts.find((x) => x.id === m.parentId);
                if (h?.subnet_id) next.add(`subnet:${h.subnet_id}`);
                next.add(`host:${m.parentId}`);
                next.add(`host-ports:${m.parentId}`);
              } else if (m.parentType === "port" && m.parentId) {
                next.add("resolved");
                const portEntry = Object.entries(portsByHost).flatMap(([hid, list]) => list.map((port) => ({ hostId: hid, port }))).find((x) => x.port.id === m.parentId);
                if (portEntry) {
                  const h = hosts.find((x) => x.id === portEntry.hostId);
                  if (h?.subnet_id) next.add(`subnet:${h.subnet_id}`);
                  next.add(`host:${portEntry.hostId}`);
                  next.add(`host-ports:${portEntry.hostId}`);
                  next.add(`port-evidence:${m.parentId}`);
                }
              } else if (m.parentType === "vulnerabilities") {
                next.add("vulnerabilities");
              } else if (m.parentType === "vulnerability_definition" && m.parentId) {
                next.add("vulnerabilities");
              }
              return next;
            });
          }}
          onToast={setToast}
        />
      )}
      {importHostsModal && (
        <ImportHostsModal
          projectId={missionId}
          context={importHostsModal}
          onClose={() => setImportHostsModal(null)}
          onSuccess={() => loadData()}
        />
      )}
      {addSubnetModal && <AddSubnetModal onClose={() => setAddSubnetModal(false)} onSubmit={handleCreateSubnet} />}
      {addHostModal && <AddHostModal subnetId={addHostModal.subnetId} subnets={subnets} onClose={() => setAddHostModal(null)} onSubmit={handleCreateHost} />}
      {renameSubnetModal && <RenameSubnetModal subnetCidr={renameSubnetModal.cidr} subnetName={renameSubnetModal.name} onClose={() => setRenameSubnetModal(null)} onSubmit={(cidr, name) => handleRenameSubnet(renameSubnetModal.id, cidr, name)} />}
      {renameHostModal && <RenameHostModal hostIp={renameHostModal.ip} hostDnsName={renameHostModal.dns_name} onClose={() => setRenameHostModal(null)} onSubmit={(ip, dnsName) => handleSaveHost(renameHostModal.id, ip, dnsName)} />}
      {portModal && (
        <PortModal
          hostId={portModal.host.id}
          hostIp={portModal.host.ip}
          mode={portModal.mode}
          port={portModal.port}
          canEdit={!portModal.port || (() => { const l = getLockForRecord("port", portModal.port!.id); return !l || l.locked_by_user_id === currentUserId; })()}
          existingPorts={(portsByHost[portModal.host.id] ?? []).map((p) => ({ number: p.number, protocol: p.protocol }))}
          onClose={() => setPortModal(null)}
          onSubmit={(data) =>
            portModal.mode === "add"
              ? handleCreatePort(portModal.host.id, data)
              : portModal.port
                ? handleUpdatePort(portModal.host.id, portModal.port.id, data)
                : Promise.resolve()
          }
          onRefresh={() => {
            if (portModal.port) loadPortsForHost(portModal.host.id);
          }}
        />
      )}
      {vulnModal && (
        <VulnerabilityModal
          missionId={missionId}
          hostId={vulnModal.host?.id ?? null}
          hostIp={vulnModal.host?.ip ?? null}
          hosts={hosts}
          subnets={subnets}
          portsByHost={portsByHost}
          mode={vulnModal.mode}
          canEdit={(() => {
            const defId = vulnModal.vuln?.vulnerability_definition_id ?? vulnModal.definition?.id;
            if (!defId) return true;
            const l = getLockForRecord("vulnerability_definition", defId);
            return !l || l.locked_by_user_id === currentUserId;
          })()}
          onRefresh={() => {
            refreshVulnDefinitions();
            hosts.forEach((h) => loadVulnsForHost(h.id));
          }}
          vuln={
            vulnModal.vuln
              ? (() => {
                  const def = vulnModal.definition ?? vulnDefinitions.find((d) => d.id === vulnModal.vuln!.vulnerability_definition_id);
                  return {
                    definition_id: vulnModal.vuln.vulnerability_definition_id,
                    title: vulnModal.vuln.definition_title ?? "",
                    severity: vulnModal.vuln.definition_severity ?? null,
                    cvss_score: vulnModal.vuln.definition_cvss_score ?? null,
                    cve_ids: vulnModal.vuln.definition_cve_ids ?? [],
                    description_md: vulnModal.vuln.definition_description_md ?? null,
                    evidence_md: vulnModal.vuln.definition_evidence_md ?? null,
                    discovered_by: vulnModal.vuln.definition_discovered_by ?? null,
                    port_id: vulnModal.vuln.port_id ?? null,
                    affected_subnet_ids: def?.affected_subnet_ids ?? [],
                    affected_host_ids: def?.affected_host_ids ?? [vulnModal.vuln.host_id],
                  };
                })()
              : vulnModal.definition
                ? {
                    definition_id: vulnModal.definition.id,
                    title: vulnModal.definition.title,
                    severity: vulnModal.definition.severity ?? null,
                    cvss_score: vulnModal.definition.cvss_score ?? null,
                    cve_ids: vulnModal.definition.cve_ids ?? [],
                    description_md: vulnModal.definition.description_md ?? null,
                    evidence_md: vulnModal.definition.evidence_md ?? null,
                    discovered_by: vulnModal.definition.discovered_by ?? null,
                    port_id: null,
                    affected_subnet_ids: vulnModal.definition.affected_subnet_ids ?? [],
                    affected_host_ids: vulnModal.definition.affected_host_ids ?? [],
                  }
                : undefined
          }
          onClose={() => setVulnModal(null)}
          onSubmit={(data) =>
            vulnModal.mode === "add"
              ? handleCreateVuln(data)
              : (vulnModal.vuln?.vulnerability_definition_id ?? vulnModal.definition?.id)
                ? handleUpdateVuln(vulnModal.vuln?.vulnerability_definition_id ?? vulnModal.definition!.id, data)
                : Promise.resolve()
          }
        />
      )}
      {manageAffectedHostsModal && (
        <ManageAffectedHostsModal
          vulnDefId={manageAffectedHostsModal.id}
          projectId={manageAffectedHostsModal.project_id}
          currentHostIds={manageAffectedHostsModal.affected_host_ids}
          affectedSubnetIds={manageAffectedHostsModal.affected_subnet_ids ?? []}
          hosts={hosts}
          subnets={subnets}
          onClose={() => setManageAffectedHostsModal(null)}
          onSuccess={() => {
            setManageAffectedHostsModal(null);
            refreshVulnDefinitions();
            hosts.forEach((h) => loadVulnsForHost(h.id));
          }}
        />
      )}
      {deleteVulnModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteVulnModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete vulnerability</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Delete &quot;{deleteVulnModal.instance.definition_title ?? "Vulnerability"}&quot;? This will remove it from all affected hosts. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeleteVulnModal(null)}>Cancel</button>
              <button type="button" className="theme-btn theme-btn-primary" style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }} onClick={() => handleDeleteVuln(deleteVulnModal.instance.vulnerability_definition_id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {deletePortModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeletePortModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete port</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Delete {deletePortModal.port.number}/{deletePortModal.port.protocol} on {hostLabel(deletePortModal.host)}? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeletePortModal(null)}>Cancel</button>
              <button type="button" className="theme-btn theme-btn-primary" style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }} onClick={() => handleDeletePort(deletePortModal.port.id, deletePortModal.host.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {deleteHostModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteHostModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete host</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Delete host {hostLabel(deleteHostModal)}? This will remove all ports, evidence, notes, and vulnerabilities on this host. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeleteHostModal(null)}>Cancel</button>
              <button type="button" className="theme-btn theme-btn-primary" style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }} onClick={() => handleDeleteHost(deleteHostModal.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {deleteSubnetModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteSubnetModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete subnet</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Delete subnet {deleteSubnetModal.cidr}{deleteSubnetModal.name ? ` (${deleteSubnetModal.name})` : ""}? This will remove all hosts in this subnet and their ports, evidence, notes, and vulnerabilities. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeleteSubnetModal(null)}>Cancel</button>
              <button type="button" className="theme-btn theme-btn-primary" style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }} onClick={() => handleDeleteSubnet(deleteSubnetModal.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {notePrintView && (
        <NotePrintView
          noteTitle={notePrintView.note.title ?? null}
          contextLabel={
            notePrintView.target === "scope"
              ? "Scope"
              : notePrintView.target === "subnet" && notePrintView.subnet
                ? `Subnet: ${notePrintView.subnet.cidr}${notePrintView.subnet.name ? ` (${notePrintView.subnet.name})` : ""}`
                : notePrintView.target === "port" && notePrintView.port && notePrintView.host
                  ? `Port: ${notePrintView.port.number}/${notePrintView.port.protocol} on ${hostLabel(notePrintView.host)}`
                  : notePrintView.target === "evidence" && notePrintView.evidence
                    ? `Evidence: ${notePrintView.evidence.caption || notePrintView.evidence.filename}`
                    : notePrintView.host
                      ? `Host: ${hostLabel(notePrintView.host)}`
                      : ""
          }
          bodyMd={notePrintView.note.body_md}
          attachments={(notePrintView.note.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename, type: a.type, url: a.url }))}
          createdBy={notePrintView.note.created_by ?? "Unknown"}
          createdAt={formatDate(notePrintView.note.created_at ?? null)}
          updatedBy={notePrintView.note.updated_by ?? "Unknown"}
          updatedAt={formatDate(notePrintView.note.updated_at ?? null)}
          onClose={() => setNotePrintView(null)}
        />
      )}
      {deleteNoteModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteNoteModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete note</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>Delete &quot;{deleteNoteModal.note.title || "Untitled"}&quot;? This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeleteNoteModal(null)}>Cancel</button>
              <button
                type="button"
                className="theme-btn theme-btn-primary"
                style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }}
                onClick={() =>
                  handleDeleteNote(
                    deleteNoteModal.note,
                    deleteNoteModal.target,
                    deleteNoteModal.target === "scope"
                      ? missionId
                      : deleteNoteModal.target === "subnet"
                        ? deleteNoteModal.subnet!.id
                        : deleteNoteModal.target === "port"
                          ? deleteNoteModal.port!.id
                          : deleteNoteModal.target === "evidence"
                            ? deleteNoteModal.evidence!.id
                            : deleteNoteModal.target === "host_ports" && deleteNoteModal.host
                              ? deleteNoteModal.host.id
                              : deleteNoteModal.target === "vulnerabilities"
                                ? ""
                                : deleteNoteModal.target === "vulnerability_definition" && deleteNoteModal.definition
                                  ? deleteNoteModal.definition.id
                                  : deleteNoteModal.host!.id
                  )
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {addTagModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setAddTagModal(null); setCreateTagModal(false); }}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, minWidth: 260, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>Add tag</h2>
            {createTagModal ? (
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Tag name</label>
                <input
                  type="text"
                  className="theme-input"
                  value={createTagName}
                  onChange={(e) => setCreateTagName(e.target.value)}
                  placeholder="e.g. Critical"
                  style={{ width: "100%", marginBottom: 12 }}
                  autoFocus
                />
                <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Color (optional)</label>
                <input
                  type="text"
                  className="theme-input"
                  value={createTagColor}
                  onChange={(e) => setCreateTagColor(e.target.value)}
                  placeholder="e.g. #ff0000 or red"
                  style={{ width: "100%", marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setCreateTagModal(false)} disabled={createTagSaving}>Cancel</button>
                  <button
                    type="button"
                    className="theme-btn theme-btn-primary"
                    disabled={!createTagName.trim() || createTagSaving}
                    onClick={() => {
                      if (!missionId || !createTagName.trim()) return;
                      setCreateTagSaving(true);
                      fetch(apiUrl(`/api/projects/${missionId}/tags`), {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: createTagName.trim(), color: createTagColor.trim() || null }),
                      })
                        .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d))))
                        .then((newTag: ProjectTag) => {
                          setTagsVersion((v) => v + 1);
                          setCreateTagModal(false);
                          setCreateTagName("");
                          setCreateTagColor("");
                          handleAddItemTag(newTag.id, addTagModal!.targetType, addTagModal!.targetId);
                          setAddTagModal(null);
                        })
                        .catch((err) => setToast(formatApiErrorDetail(err?.detail ?? err, "Failed to create tag")))
                        .finally(() => setCreateTagSaving(false));
                    }}
                  >
                    {createTagSaving ? "Creating…" : "Create and add"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {projectTags.length === 0 ? (
                  <p style={{ margin: "0 0 12px", color: "var(--text-muted)", fontSize: 14 }}>No tags in this mission. Create one first.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {projectTags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="theme-btn theme-btn-ghost"
                        style={{ justifyContent: "flex-start", textAlign: "left" }}
                        onClick={() => handleAddItemTag(t.id, addTagModal.targetType, addTagModal.targetId)}
                      >
                        <span style={{ marginRight: 8, color: t.color ?? "var(--text-muted)" }}>🏷</span>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setCreateTagModal(true)}>Create tag</button>
                  <button type="button" className="theme-btn theme-btn-ghost" onClick={() => { setAddTagModal(null); setCreateTagModal(false); }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {stubModal && <StubModal title={stubModal.title} message={stubModal.message} onClose={() => setStubModal(null)} />}
      {toast && <Toast message={toast} />}
    </div>
  );
}

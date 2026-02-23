"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl, formatApiErrorDetail } from "../lib/api";
import {
  type ReportDefinition,
  type ExecuteReportResponse,
  TEMPLATE_NON_STANDARD_PORTS,
  TEMPLATE_PORT_80_WITH_BANNERS,
} from "../lib/report-builder-types";
import { ColumnPicker } from "./column-picker";

type ReportBuilderPanelProps = {
  projectId: string;
  onToast?: (msg: string) => void;
  savedReports?: { id: string; name: string; definition?: ReportDefinition }[];
  onSavedReportsChange?: () => void;
};

const DEFAULT_COLUMNS = [
  "host_ip",
  "port",
  "proto",
  "state",
  "service_name",
  "latest_http_title",
  "whois_asn",
];

export function ReportBuilderPanel({
  projectId,
  onToast,
  savedReports = [],
  onSavedReportsChange,
}: ReportBuilderPanelProps) {
  const [columnsOptions, setColumnsOptions] = useState<[string, string][]>([]);
  const [definition, setDefinition] = useState<ReportDefinition>({
    filters: [],
    columns: [...DEFAULT_COLUMNS],
    sort: { column: "host_ip", descending: false },
    limit: 100,
    offset: 0,
  });
  const [result, setResult] = useState<ExecuteReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/api/projects/${projectId}/reports/service-current/columns`), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { service_current?: [string, string][] }) => {
        const list = data?.service_current ?? [];
        setColumnsOptions(list);
        if (list.length && definition.columns.length === 0) {
          setDefinition((d) => ({ ...d, columns: DEFAULT_COLUMNS.filter((c) => list.some(([id]) => id === c)) }));
        }
      })
      .catch(() => setColumnsOptions([]));
  }, [projectId]);

  const runReport = useCallback((override?: Partial<ReportDefinition>) => {
    const def = override ? { ...definition, ...override } : definition;
    setLoading(true);
    setError("");
    fetch(apiUrl(`/api/projects/${projectId}/reports/execute`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ definition: def }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(d?.detail, "Report failed"));
        }
        return r.json();
      })
      .then((data: ExecuteReportResponse) => setResult(data))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Report failed");
        setResult(null);
      })
      .finally(() => setLoading(false));
  }, [projectId, definition]);

  const applyTemplate = (template: ReportDefinition) => {
    setDefinition((d) => ({
      ...d,
      filters: template.filters,
      columns: template.columns.length ? template.columns : d.columns,
      sort: template.sort ?? d.sort,
      limit: template.limit ?? d.limit,
      offset: 0,
    }));
    setResult(null);
  };

  const setSort = (column: string) => {
    setDefinition((d) => ({
      ...d,
      sort: {
        column,
        descending: d.sort?.column === column ? !d.sort.descending : false,
      },
      offset: 0,
    }));
  };

  const setPage = (newOffset: number) => {
    setDefinition((d) => ({ ...d, offset: newOffset }));
    runReport({ ...definition, offset: newOffset });
  };

  const saveReport = () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    fetch(apiUrl(`/api/projects/${projectId}/reports/saved/v2`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: saveDesc.trim() || null, definition }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(formatApiErrorDetail(d?.detail, "Save failed")); });
        return r.json();
      })
      .then(() => {
        setSaveName("");
        setSaveDesc("");
        onSavedReportsChange?.();
        onToast?.("Report saved");
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false));
  };

  const exportCsv = () => {
    if (!result?.rows?.length) {
      onToast?.("No data to export");
      return;
    }
    const cols = result.columns;
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = cols.map(escape).join(",");
    const lines = result.rows.map((r) => cols.map((c) => escape(r[c])).join(","));
    const content = [header, ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report.csv";
    a.click();
    URL.revokeObjectURL(url);
    onToast?.(`Exported ${result.rows.length} rows as CSV`);
  };

  const exportJson = () => {
    if (!result) {
      onToast?.("No data to export");
      return;
    }
    const content = JSON.stringify({ columns: result.columns, rows: result.rows, total_count: result.total_count }, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report.json";
    a.click();
    URL.revokeObjectURL(url);
    onToast?.(`Exported ${result?.rows?.length ?? 0} rows as JSON`);
  };

  const cols = result?.columns ?? definition.columns;
  const rows = result?.rows ?? [];
  const total = result?.total_count ?? 0;
  const pageSize = definition.limit;
  const currentPage = Math.floor(definition.offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Report Builder</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
        Query services with latest snapshot (Nmap, GoWitness, WHOIS). Mission-scoped; safe structured filters only.
      </p>

      {/* Templates */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>Templates:</span>
        <button
          type="button"
          className="theme-btn theme-btn-ghost"
          onClick={() => applyTemplate(TEMPLATE_NON_STANDARD_PORTS)}
        >
          Non-standard ports (not 80/443)
        </button>
        <button
          type="button"
          className="theme-btn theme-btn-ghost"
          onClick={() => applyTemplate(TEMPLATE_PORT_80_WITH_BANNERS)}
        >
          Port 80 with banners
        </button>
      </div>

      {/* Columns */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Columns</label>
        <ColumnPicker
          options={columnsOptions}
          selected={definition.columns.length ? definition.columns : DEFAULT_COLUMNS.filter((c) => columnsOptions.some(([id]) => id === c))}
          onChange={(selected) => setDefinition((d) => ({ ...d, columns: selected.length ? selected : [...DEFAULT_COLUMNS], offset: 0 }))}
          placeholder="Search columns…"
        />
      </div>

      {/* Simple filters */}
      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span>Port not in</span>
          <input
            type="text"
            placeholder="80, 443"
            style={{ width: 100, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) return;
              const nums = v.split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !Number.isNaN(n));
              if (nums.length) setDefinition((d) => ({ ...d, filters: [...d.filters.filter((f) => !("port" in f && f.port && typeof f.port === "object" && "not_in" in f.port)), { port: { not_in: nums } }], offset: 0 }));
            }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span>State</span>
          <select
            value={definition.filters.find((f) => f.state !== undefined)?.state ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setDefinition((d) => ({
                ...d,
                filters: [...d.filters.filter((f) => f.state === undefined), ...(v ? [{ state: v }] : [])],
                offset: 0,
              }));
            }}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
          >
            <option value="">Any</option>
            <option value="open">open</option>
            <option value="closed">closed</option>
            <option value="filtered">filtered</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={definition.filters.some((f) => f.has_http === true)}
            onChange={(e) => {
              const v = e.target.checked;
              setDefinition((d) => ({
                ...d,
                filters: [...d.filters.filter((f) => f.has_http === undefined), ...(v ? [{ has_http: true }] : [])],
                offset: 0,
              }));
            }}
          />
          Has HTTP
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span>Title contains</span>
          <input
            type="text"
            placeholder="admin"
            style={{ width: 120, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              setDefinition((d) => ({
                ...d,
                filters: [...d.filters.filter((f) => f.title_contains === undefined), ...(v ? [{ title_contains: v }] : [])],
                offset: 0,
              }));
            }}
          />
        </label>
      </div>

      {/* Sort */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Sort</label>
        <select
          value={definition.sort?.column ?? "host_ip"}
          onChange={(e) => setDefinition((d) => ({ ...d, sort: { column: e.target.value, descending: d.sort?.descending ?? false }, offset: 0 }))}
          style={{ padding: "6px 10px", marginRight: 8, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
        >
          {columnsOptions.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={definition.sort?.descending ?? false}
            onChange={(e) => setDefinition((d) => ({ ...d, sort: { ...(d.sort ?? { column: "host_ip", descending: false }), descending: e.target.checked }, offset: 0 }))}
          />
          Descending
        </label>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" className="theme-btn theme-btn-primary" onClick={runReport} disabled={loading}>
          {loading ? "Running…" : "Run report"}
        </button>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
          {result ? `${result.rows.length} of ${result.total_count} results` : "Run to see results"}
        </span>
        <button type="button" className="theme-btn" onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </button>
        <button type="button" className="theme-btn" onClick={exportJson} disabled={!result}>
          Export JSON
        </button>
        {onSavedReportsChange && (
          <>
            <input
              type="text"
              placeholder="Save as name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              style={{ width: 140, padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
              style={{ width: 160, padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
            />
            <button type="button" className="theme-btn theme-btn-ghost" disabled={!saveName.trim() || saving} onClick={saveReport}>
              {saving ? "Saving…" : "Save report"}
            </button>
          </>
        )}
      </div>

      {/* Results table */}
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
              {cols.map((c) => (
                <th
                  key={c}
                  style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  onClick={() => setSort(c)}
                  title="Click to sort"
                >
                  {c}
                  {definition.sort?.column === c && (definition.sort.descending ? " ↓" : " ↑")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                {cols.map((c) => (
                  <td key={c} style={{ padding: "8px 12px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row[c] != null ? String(row[c]) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
            {result ? "No rows" : "Run report to load results"}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            disabled={definition.offset <= 0 || loading}
            onClick={() => setPage(Math.max(0, definition.offset - pageSize))}
          >
            Previous
          </button>
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            disabled={definition.offset + pageSize >= total || loading}
            onClick={() => setPage(definition.offset + pageSize)}
          >
            Next
          </button>
          <select
            value={definition.limit}
            onChange={(e) => setDefinition((d) => ({ ...d, limit: Number(e.target.value), offset: 0 }))}
            style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
          >
            {[50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

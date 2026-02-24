"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl, formatApiErrorDetail } from "../lib/api";
import { ColumnPicker } from "./column-picker";

export type ReportConfig = { id: string; name: string };

export type ReportFilters = {
  exclude_unresolved: boolean;
  status: string;
  subnet_id: string;
  port_number: string;
  port_protocol: string;
  severity: string;
};

export type Subnet = { id: string; cidr: string; name: string | null };

export type BuilderColumns = Record<string, [string, string][]>;

export type SavedReportItem = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  query_definition: { data_source: string; columns: string[]; filter_expression: string };
  created_at: string;
};

type CustomReportsPanelProps = {
  projectId: string;
  subnets: Subnet[];
  onToast?: (msg: string) => void;
  savedReports?: SavedReportItem[];
  onSavedReportsChange?: () => void;
  /** "all" = both sections (default), "builder" = report builder only, "predefined" = predefined reports only */
  mode?: "all" | "builder" | "predefined";
};

function formatRowsToText(rows: Record<string, unknown>[], columnKeys?: string[]): string {
  if (rows.length === 0) return "";
  const keys = (columnKeys && columnKeys.length > 0) ? columnKeys : Object.keys(rows[0]!);
  const header = keys.join("\t");
  const dataLines = rows.map((r) => {
    if (keys.length === 1) return String(r[keys[0]!] ?? "");
    return keys.map((k) => String(r[k] ?? "")).join("\t");
  });
  return [header, ...dataLines].join("\n");
}

function formatRowsToCsv(rows: Record<string, unknown>[], columnKeys?: string[]): string {
  if (rows.length === 0) return "";
  const keys = (columnKeys && columnKeys.length > 0) ? columnKeys : Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = keys.map(escape).join(",");
  const lines = rows.map((r) => keys.map((k) => escape(r[k])).join(","));
  return [header, ...lines].join("\n");
}

function formatRowsToJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const FILTER_EXAMPLES = [
  "ip contains \"10.\"",
  "service == https",
  "severity >= High",
  "port >= 443",
  "unresolved == false",
];

export function CustomReportsPanel({ projectId, subnets, onToast, savedReports = [], onSavedReportsChange, mode = "all" }: CustomReportsPanelProps) {
  const [builderColumns, setBuilderColumns] = useState<BuilderColumns>({});
  const [builderDataSource, setBuilderDataSource] = useState("hosts");
  const [builderSelectedCols, setBuilderSelectedCols] = useState<string[]>(["ip", "hostname"]);
  const [builderFilter, setBuilderFilter] = useState("");
  const [builderRows, setBuilderRows] = useState<Record<string, unknown>[]>([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState("");
  const [builderExportFormat, setBuilderExportFormat] = useState<"txt" | "csv" | "json">("txt");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagBulkMode, setTagBulkMode] = useState<"all" | "selected">("all");
  const [builderTags, setBuilderTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [tagPickerLoading, setTagPickerLoading] = useState(false);
  const [tagApplyLoading, setTagApplyLoading] = useState(false);
  const [selectedTagIdForBulk, setSelectedTagIdForBulk] = useState<string>("");
  const [selectedBuilderRowIndices, setSelectedBuilderRowIndices] = useState<number[]>([]);

  const [configs, setConfigs] = useState<ReportConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportFormat, setExportFormat] = useState<"txt" | "csv" | "json">("txt");
  const [filters, setFilters] = useState<ReportFilters>({
    exclude_unresolved: true,
    status: "",
    subnet_id: "",
    port_number: "",
    port_protocol: "",
    severity: "",
  });
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/api/projects/${projectId}/reports/configs`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ReportConfig[]) => {
        setConfigs(list);
        if (list.length && !selectedType) setSelectedType(list[0]!.id);
      })
      .finally(() => setConfigsLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetch(apiUrl(`/api/projects/${projectId}/reports/builder/columns`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((cols: BuilderColumns) => {
        setBuilderColumns(cols);
        const hosts = cols["hosts"] ?? [];
        if (hosts.length && builderSelectedCols.length === 0) {
          setBuilderSelectedCols(hosts.slice(0, 2).map(([id]) => id));
        }
      });
  }, [projectId]);

  useEffect(() => {
    const cols = builderColumns[builderDataSource];
    if (cols?.length) {
      setBuilderSelectedCols((prev) => prev.filter((c) => cols.some(([id]) => id === c)));
    }
  }, [builderDataSource, builderColumns]);

  useEffect(() => {
    if (!tagPickerOpen || !projectId) return;
    setTagPickerLoading(true);
    fetch(apiUrl(`/api/projects/${projectId}/tags`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; name: string; color: string | null }[]) => {
        setBuilderTags(list);
        setSelectedTagIdForBulk(list[0]?.id ?? "");
      })
      .finally(() => setTagPickerLoading(false));
  }, [tagPickerOpen, projectId]);

  const toggleBuilderRowSelection = useCallback((index: number) => {
    setSelectedBuilderRowIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  }, []);
  const selectAllBuilderRows = useCallback(() => {
    setSelectedBuilderRowIndices(builderRows.map((_, i) => i));
  }, [builderRows.length]);
  const clearBuilderRowSelection = useCallback(() => {
    setSelectedBuilderRowIndices([]);
  }, []);

  const runBuilderReport = useCallback(() => {
    setBuilderLoading(true);
    setBuilderError("");
    fetch(apiUrl(`/api/projects/${projectId}/reports/builder`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        data_source: builderDataSource,
        columns: builderSelectedCols.length ? builderSelectedCols : (builderColumns[builderDataSource] ?? []).map(([id]) => id),
        filter_expression: builderFilter.trim(),
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(d.detail, "Report failed"));
        }
        return r.json();
      })
      .then((data: { rows: Record<string, unknown>[] }) => {
        setBuilderRows(data.rows ?? []);
        setSelectedBuilderRowIndices([]);
      })
      .catch((e) => {
        setBuilderError(e instanceof Error ? e.message : "Report failed");
        setBuilderRows([]);
      })
      .finally(() => setBuilderLoading(false));
  }, [projectId, builderDataSource, builderSelectedCols, builderFilter, builderColumns]);

  const builderColumnKeys = builderSelectedCols.length ? builderSelectedCols : (builderColumns[builderDataSource] ?? []).map(([id]) => id);

  const handleBuilderExport = () => {
    let content: string;
    let ext: string;
    let mime: string;
    if (builderExportFormat === "csv") {
      content = formatRowsToCsv(builderRows, builderColumnKeys);
      ext = "csv";
      mime = "text/csv";
    } else if (builderExportFormat === "json") {
      content = formatRowsToJson(builderRows);
      ext = "json";
      mime = "application/json";
    } else {
      content = formatRowsToText(builderRows, builderColumnKeys);
      ext = "txt";
      mime = "text/plain";
    }
    downloadBlob(content, `report-builder.${ext}`, mime);
    onToast?.(`Exported ${builderRows.length} rows as ${ext.toUpperCase()}`);
  };

  const runReport = useCallback(() => {
    if (!selectedType) return;
    setLoading(true);
    setError("");
    const body = {
      report_type: selectedType,
      filters: {
        exclude_unresolved: filters.exclude_unresolved,
        status: filters.status || null,
        subnet_id: filters.subnet_id || null,
        port_number: filters.port_number.trim() ? parseInt(filters.port_number, 10) || null : null,
        port_protocol: filters.port_protocol || null,
        severity: filters.severity || null,
      },
    };
    fetch(apiUrl(`/api/projects/${projectId}/reports/run`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(d.detail, "Report failed"));
        }
        return r.json();
      })
      .then((data: { rows: Record<string, unknown>[] }) => {
        setRows(data.rows ?? []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Report failed");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, selectedType, filters]);

  useEffect(() => {
    if (selectedType && configs.length) runReport();
  }, [selectedType, filters, configs.length]);

  const handleExport = () => {
    const cfg = configs.find((c) => c.id === selectedType);
    const base = cfg ? cfg.name.replace(/\s+/g, "-").toLowerCase() : "report";
    let content: string;
    let ext: string;
    let mime: string;
    if (exportFormat === "csv") {
      content = formatRowsToCsv(rows);
      ext = "csv";
      mime = "text/csv";
    } else if (exportFormat === "json") {
      content = formatRowsToJson(rows);
      ext = "json";
      mime = "application/json";
    } else {
      content = formatRowsToText(rows);
      ext = "txt";
      mime = "text/plain";
    }
    downloadBlob(content, `${base}.${ext}`, mime);
    onToast?.(`Exported ${rows.length} rows as ${ext.toUpperCase()}`);
  };

  const previewText = formatRowsToText(rows);
  const showUnresolvedFilter = !["unresolved_hosts"].includes(selectedType);
  const showStatusFilter = !["unresolved_hosts", "evidence"].includes(selectedType);
  const showSubnetFilter = true;
  const showPortFilter = selectedType === "open_ports";
  const showSeverityFilter = selectedType === "vulns_flat" || selectedType === "vulns_by_severity";

  const showBuilder = mode === "all" || mode === "builder";
  const showPredefined = mode === "all" || mode === "predefined";

  return (
    <div style={{ padding: 24 }}>
      {mode === "all" && <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Custom Reports</h2>}
      {mode === "builder" && <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Report builder</h2>}
      {mode === "predefined" && <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Predefined reports</h2>}

      {showBuilder && (
      <section style={{ marginBottom: mode === "all" ? 40 : 0 }}>
        {mode === "all" && <h3 style={{ margin: "0 0 12px", fontSize: "1rem", fontWeight: 600 }}>Report builder</h3>}
        <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
          Select columns and criteria using the filter language (e.g. <code style={{ background: "var(--bg-panel)", padding: "1px 4px", borderRadius: 4 }}>ip contains "10."</code>, <code style={{ background: "var(--bg-panel)", padding: "1px 4px", borderRadius: 4 }}>severity >= High</code>).
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Data source</label>
          <select
            value={builderDataSource}
            onChange={(e) => setBuilderDataSource(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              color: "var(--text)",
              fontSize: 14,
              minWidth: 160,
            }}
          >
            <option value="hosts">Hosts</option>
            <option value="ports">Ports</option>
            <option value="evidence">Evidence</option>
            <option value="vulns">Vulnerabilities</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Columns to include</label>
          <ColumnPicker
            options={builderColumns[builderDataSource] ?? []}
            selected={builderSelectedCols}
            onChange={setBuilderSelectedCols}
            placeholder="Search columns…"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Filter (optional)</label>
          <input
            type="text"
            value={builderFilter}
            onChange={(e) => setBuilderFilter(e.target.value)}
            placeholder='e.g. ip contains "10." or severity >= High'
            style={{
              width: "100%",
              maxWidth: 400,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              color: "var(--text)",
              fontSize: 14,
              fontFamily: "monospace",
            }}
          />
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {FILTER_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="theme-btn theme-btn-ghost"
                style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 8px" }}
                onClick={() => setBuilderFilter(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {builderError && (
          <div style={{ padding: 12, marginBottom: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8 }}>
            {builderError}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <button type="button" className="theme-btn theme-btn-primary" onClick={runBuilderReport} disabled={builderLoading}>
            {builderLoading ? "Loading…" : "Run report"}
          </button>
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{builderRows.length} results</span>
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
              <button
                type="button"
                className="theme-btn theme-btn-ghost"
                disabled={!saveName.trim() || saving}
                onClick={() => {
                  const name = saveName.trim();
                  if (!name) return;
                  setSaving(true);
                  fetch(apiUrl(`/api/projects/${projectId}/reports/saved`), {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name,
                      description: saveDesc.trim() || null,
                      query_definition: {
                        data_source: builderDataSource,
                        columns: builderSelectedCols.length ? builderSelectedCols : (builderColumns[builderDataSource] ?? []).map(([id]) => id),
                        filter_expression: builderFilter.trim(),
                      },
                    }),
                  })
                    .then((r) => {
                      if (!r.ok) return r.json().then((d) => { throw new Error(formatApiErrorDetail(d?.detail, "Save failed")); });
                      return r.json();
                    })
                    .then(() => {
                      setSaveName("");
                      setSaveDesc("");
                      onSavedReportsChange();
                      onToast?.("Report saved");
                    })
                    .catch((e) => onToast?.(e instanceof Error ? e.message : "Save failed"))
                    .finally(() => setSaving(false));
                }}
              >
                {saving ? "Saving…" : "Save report"}
              </button>
            </>
          )}
          <select
            value={builderExportFormat}
            onChange={(e) => setBuilderExportFormat(e.target.value as "txt" | "csv" | "json")}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text)", fontSize: 13 }}
          >
            <option value="txt">Plain text</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <button type="button" className="theme-btn" onClick={handleBuilderExport} disabled={builderRows.length === 0}>
            Export
          </button>
          <button
            type="button"
            className="theme-btn"
            disabled={builderRows.length === 0}
            onClick={() => {
              setTagBulkMode("all");
              setTagPickerOpen(true);
            }}
          >
            Tag all
          </button>
          <button
            type="button"
            className="theme-btn"
            disabled={selectedBuilderRowIndices.length === 0}
            onClick={() => {
              setTagBulkMode("selected");
              setTagPickerOpen(true);
            }}
          >
            Tag selected
          </button>
        </div>

        {tagPickerOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
            onClick={() => !tagApplyLoading && setTagPickerOpen(false)}
          >
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 20,
                minWidth: 280,
                maxWidth: "90vw",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>
                {tagBulkMode === "all"
                  ? `Apply tag to all ${builderRows.length} results`
                  : `Apply tag to ${selectedBuilderRowIndices.length} selected results`}
              </h4>
              {tagPickerLoading ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading tags…</p>
              ) : builderTags.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No tags. Create tags in the Mission first.</p>
              ) : (
                <>
                  <select
                    value={selectedTagIdForBulk}
                    onChange={(e) => setSelectedTagIdForBulk(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 13,
                      marginBottom: 16,
                    }}
                  >
                    {builderTags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      disabled={tagApplyLoading}
                      onClick={() => setTagPickerOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="theme-btn theme-btn-primary"
                      disabled={tagApplyLoading}
                      onClick={() => {
                        const tagId = selectedTagIdForBulk;
                        if (!tagId) return;
                        const rowsToTag =
                          tagBulkMode === "all"
                            ? builderRows
                            : builderRows.filter((_, i) => selectedBuilderRowIndices.includes(i));
                        const assignments = rowsToTag
                          .map((r) => ({
                            target_type: r._target_type as string,
                            target_id: r._target_id as string,
                          }))
                          .filter((a) => a.target_id);
                        if (assignments.length === 0) {
                          onToast?.("No valid targets to tag");
                          return;
                        }
                        setTagApplyLoading(true);
                        fetch(apiUrl(`/api/projects/${projectId}/item-tags/bulk`), {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tag_id: tagId, assignments }),
                        })
                          .then(async (r) => {
                            if (!r.ok) {
                              const d = await r.json().catch(() => ({}));
                              throw new Error(formatApiErrorDetail(d?.detail, "Tag apply failed"));
                            }
                            return r.json();
                          })
                          .then((data: { created: number; skipped: number }) => {
                            setTagPickerOpen(false);
                            if (data.skipped > 0) {
                              onToast?.(`Tag applied: ${data.created} created, ${data.skipped} already had tag`);
                            } else {
                              onToast?.(`Tag applied to ${data.created} items`);
                            }
                          })
                          .catch((e) => onToast?.(e instanceof Error ? e.message : "Tag apply failed"))
                          .finally(() => setTagApplyLoading(false));
                      }}
                    >
                      {tagApplyLoading ? "Applying…" : "Apply"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Preview</label>
          {builderRows.length > 0 ? (
            <>
              <div
                style={{
                  marginBottom: 8,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={
                      builderRows.length > 0 &&
                      selectedBuilderRowIndices.length === builderRows.length
                    }
                    onChange={(e) =>
                      e.target.checked ? selectAllBuilderRows() : clearBuilderRowSelection()
                    }
                  />
                  Select all
                </label>
                {selectedBuilderRowIndices.length > 0 && (
                  <button
                    type="button"
                    className="theme-btn theme-btn-ghost"
                    style={{ fontSize: 12, padding: "2px 8px" }}
                    onClick={clearBuilderRowSelection}
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div
                style={{
                  maxHeight: 220,
                  overflow: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  backgroundColor: "var(--bg-panel)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg-panel)" }}>
                      <th style={{ width: 32, padding: "6px 8px", textAlign: "left" }} />
                      {builderColumnKeys.map((k) => (
                        <th key={k} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {builderRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            type="checkbox"
                            checked={selectedBuilderRowIndices.includes(i)}
                            onChange={() => toggleBuilderRowSelection(i)}
                          />
                        </td>
                        {builderColumnKeys.map((k) => (
                          <td key={k} style={{ padding: "4px 8px", wordBreak: "break-all" }}>
                            {String(row[k] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: 12,
                fontSize: 12,
                fontFamily: "monospace",
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                maxHeight: 200,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {builderLoading ? "Loading…" : "(run report to preview)"}
            </pre>
          )}
        </div>
      </section>
      )}

      {mode === "all" && <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />}

      {showPredefined && (
      <section>
        {mode === "all" && <h3 style={{ margin: "0 0 12px", fontSize: "1rem", fontWeight: 600 }}>Predefined reports</h3>}
        <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
          Select a report type, apply filters, preview, and export.
        </p>

      {configsLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading report types…</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
              Report type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                fontSize: 14,
                minWidth: 280,
              }}
            >
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {showUnresolvedFilter && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!filters.exclude_unresolved}
                  onChange={(e) => setFilters((f) => ({ ...f, exclude_unresolved: !e.target.checked }))}
                />
                Include unresolved
              </label>
            )}
            {showStatusFilter && (
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  <option value="">All</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            )}
            {showSubnetFilter && (
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                  Subnet
                </label>
                <select
                  value={filters.subnet_id}
                  onChange={(e) => setFilters((f) => ({ ...f, subnet_id: e.target.value }))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  <option value="">All subnets</option>
                  {subnets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.cidr}
                      {s.name ? ` (${s.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showPortFilter && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                    Port
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 443"
                    value={filters.port_number}
                    onChange={(e) => setFilters((f) => ({ ...f, port_number: e.target.value }))}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg-panel)",
                      color: "var(--text)",
                      fontSize: 13,
                      width: "100%",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                    Protocol
                  </label>
                  <select
                    value={filters.port_protocol}
                    onChange={(e) => setFilters((f) => ({ ...f, port_protocol: e.target.value }))}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg-panel)",
                      color: "var(--text)",
                      fontSize: 13,
                      width: "100%",
                    }}
                  >
                    <option value="">All</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
              </>
            )}
            {showSeverityFilter && (
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                  Severity
                </label>
                <select
                  value={filters.severity}
                  onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  <option value="">All</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="Info">Info</option>
                </select>
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: 12,
                marginBottom: 16,
                backgroundColor: "var(--error-bg)",
                color: "var(--error)",
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
              {loading ? "Loading…" : `${rows.length} results`}
            </span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as "txt" | "csv" | "json")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                fontSize: 13,
              }}
            >
              <option value="txt">Plain text (.txt)</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <button
              type="button"
              onClick={handleExport}
              disabled={rows.length === 0}
              className="theme-btn theme-btn-primary"
            >
              Export
            </button>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Preview
            </label>
            <pre
              style={{
                margin: 0,
                padding: 12,
                fontSize: 12,
                fontFamily: "monospace",
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                maxHeight: 320,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {loading ? "Loading…" : previewText || "(no results)"}
            </pre>
          </div>
        </>
      )}
      </section>
      )}
    </div>
  );
}

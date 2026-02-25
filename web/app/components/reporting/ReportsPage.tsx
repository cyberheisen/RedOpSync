"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl, formatApiErrorDetail } from "../../lib/api";
import type {
  SourceId,
  ReportDefinitionV2,
  ReportColumnSpec,
  ReportGroup,
  FieldMetadata,
  SavedReportItem,
  ExecuteReportResponse,
} from "../../lib/reporting-types";
import { DEFAULT_COLUMN_KEYS } from "../../lib/reporting-types";
import { SourcesSelector } from "./SourcesSelector";
import { SavedReportsList } from "./SavedReportsList";
import { ColumnsBuilder } from "./ColumnsBuilder";
import { FilterBuilder } from "./FilterBuilder";
import { ResultsTable } from "./ResultsTable";

type ColumnWithSort = ReportColumnSpec & { sort?: "asc" | "desc" | "none" };

const DEFAULT_SOURCES: SourceId[] = ["core", "nmap", "http", "gowitness", "whois"];

type Props = {
  projectId: string;
  onToast?: (msg: string) => void;
};

export function ReportsPage({ projectId, onToast }: Props) {
  const [sources, setSources] = useState<SourceId[]>(DEFAULT_SOURCES);
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [columns, setColumns] = useState<ColumnWithSort[]>([]);
  const [filter, setFilter] = useState<ReportGroup | null>(null);
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);

  const [result, setResult] = useState<ExecuteReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [savedReports, setSavedReports] = useState<SavedReportItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagBulkMode, setTagBulkMode] = useState<"all" | "selected">("all");
  const [reportTags, setReportTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [tagPickerLoading, setTagPickerLoading] = useState(false);
  const [selectedTagIdForBulk, setSelectedTagIdForBulk] = useState("");
  const [tagApplyLoading, setTagApplyLoading] = useState(false);
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);

  const loadFields = useCallback(() => {
    const q = sources.length ? `?sources=${sources.join(",")}` : "";
    fetch(apiUrl(`/api/projects/${projectId}/reporting/fields${q}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((data: { fields: FieldMetadata[] }) => setFields(data.fields || []))
      .catch(() => setFields([]));
  }, [projectId, sources]);

  const loadSavedReports = useCallback(() => {
    fetch(apiUrl(`/api/projects/${projectId}/reports/saved`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SavedReportItem[]) => setSavedReports(Array.isArray(list) ? list : []))
      .catch(() => setSavedReports([]));
  }, [projectId]);

  useEffect(() => { loadFields(); }, [loadFields]);
  useEffect(() => { loadSavedReports(); }, [loadSavedReports]);

  useEffect(() => {
    if (!tagPickerOpen || !projectId) return;
    setTagPickerLoading(true);
    fetch(apiUrl(`/api/projects/${projectId}/tags`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; name: string; color: string | null }[]) => {
        setReportTags(Array.isArray(list) ? list : []);
        setSelectedTagIdForBulk(list?.[0]?.id ?? "");
      })
      .catch(() => setReportTags([]))
      .finally(() => setTagPickerLoading(false));
  }, [tagPickerOpen, projectId]);

  const toggleRowSelection = useCallback((index: number) => {
    setSelectedRowIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  }, []);
  const selectAllRows = useCallback(() => {
    setSelectedRowIndices((result?.rows ?? []).map((_, i) => i));
  }, [result?.rows]);
  const clearRowSelection = useCallback(() => setSelectedRowIndices([]), []);

  useEffect(() => {
    if (fields.length && columns.length === 0) {
      const defaultCols: ColumnWithSort[] = DEFAULT_COLUMN_KEYS.filter((k) => fields.some((f) => f.key === k))
        .map((key) => ({ key, label: fields.find((f) => f.key === key)?.label ?? key, sort: "none" as const }));
      setColumns(defaultCols);
    }
  }, [fields]);

  const buildDefinition = useCallback(
    (overrides?: { offset?: number; limit?: number }): ReportDefinitionV2 => {
      const sort = columns
        .filter((c) => c.sort && c.sort !== "none")
        .map((c) => ({ key: c.key, direction: (c.sort === "desc" ? "desc" : "asc") as "asc" | "desc" }));
      return {
        sources,
        columns: columns.map((c) => ({ key: c.key, label: c.label })),
        sort: sort.length ? sort : [{ key: "host_ip", direction: "asc" }],
        filter,
        limit: overrides?.limit ?? limit,
        offset: overrides?.offset ?? offset,
      };
    },
    [sources, columns, filter, limit, offset]
  );

  const runReport = useCallback(
    (pageOffset?: number) => {
      setLoading(true);
      setError("");
      const def = buildDefinition(pageOffset !== undefined ? { offset: pageOffset } : undefined);
      fetch(apiUrl(`/api/projects/${projectId}/reporting/execute`), {
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
        .then((data: ExecuteReportResponse) => {
          setResult(data);
          setLastRunTime(new Date().toLocaleTimeString());
          setSelectedRowIndices([]);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Report failed");
          setResult(null);
        })
        .finally(() => setLoading(false));
    },
    [projectId, buildDefinition]
  );

  const loadSavedReport = useCallback((report: SavedReportItem) => {
    setSelectedReportId(report.id);
    const def = report.definition_json as ReportDefinitionV2 | undefined;
    if (!def) return;
    if (Array.isArray(def.sources)) setSources(def.sources as SourceId[]);
    if (Array.isArray(def.columns) && def.columns.length > 0) {
      const hasKey = def.columns.some((c: unknown) => typeof c === "object" && c !== null && "key" in c);
      if (hasKey) {
        setColumns((def.columns as ReportColumnSpec[]).map((c) => ({ ...c, sort: "none" as const })));
      }
    }
    if (def.filter && typeof def.filter === "object" && "op" in def.filter && "children" in def.filter) {
      setFilter(def.filter as ReportGroup);
    }
    if (typeof def.limit === "number") setLimit(def.limit);
    setOffset(0);
    setResult(null);
  }, []);

  const handleSave = useCallback(() => {
    if (selectedReportId) {
      setSaving(true);
      const def = buildDefinition();
      fetch(apiUrl(`/api/projects/${projectId}/reports/saved/${selectedReportId}/v2`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: def }),
      })
        .then((r) => {
          if (!r.ok) return r.json().then((d) => { throw new Error(formatApiErrorDetail(d?.detail, "Update failed")); });
          return r.json();
        })
        .then(() => {
          loadSavedReports();
          onToast?.("Report updated");
        })
        .catch((e) => onToast?.(e instanceof Error ? e.message : "Update failed"))
        .finally(() => setSaving(false));
      return;
    }
    setSaveModalOpen(true);
  }, [projectId, selectedReportId, buildDefinition, loadSavedReports, onToast]);

  const handleSaveAs = useCallback(() => {
    setSaveAsModalOpen(true);
    setSaveName("");
    setSaveDesc("");
  }, []);

  const handleSaveNew = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    const def = buildDefinition();
    fetch(apiUrl(`/api/projects/${projectId}/reports/saved/v3`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: saveDesc.trim() || null, definition: def }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(formatApiErrorDetail(d?.detail, "Save failed")); });
        return r.json();
      })
      .then(() => {
        setSaveModalOpen(false);
        setSaveAsModalOpen(false);
        setSaveName("");
        setSaveDesc("");
        loadSavedReports();
        onToast?.("Report saved");
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false));
  }, [projectId, buildDefinition, loadSavedReports, onToast]);

  const handleDuplicate = useCallback((report: SavedReportItem) => {
    const def = report.definition_json as ReportDefinitionV2 | undefined;
    if (def?.sources) setSources(def.sources as SourceId[]);
    if (def?.columns?.length) setColumns(def.columns.map((c) => ({ ...c, sort: "none" as const })));
    if (def?.filter) setFilter(def.filter);
    if (def?.limit) setLimit(def.limit);
    setOffset(0);
    setSelectedReportId(null);
    setSaveAsModalOpen(true);
    setSaveName(`${report.name} (copy)`);
    setSaveDesc(report.description || "");
  }, []);

  const handleDelete = useCallback(
    (report: SavedReportItem) => {
      if (!confirm(`Delete "${report.name}"?`)) return;
      fetch(apiUrl(`/api/projects/${projectId}/reports/saved/${report.id}`), { method: "DELETE", credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("Delete failed");
          loadSavedReports();
          if (selectedReportId === report.id) setSelectedReportId(null);
          onToast?.("Report deleted");
        })
        .catch((e) => onToast?.(e instanceof Error ? e.message : "Delete failed"));
    },
    [projectId, loadSavedReports, selectedReportId, onToast]
  );

  const exportCsv = useCallback(() => {
    if (!result) return;
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const writeCsv = (data: ExecuteReportResponse) => {
      if (!data?.rows?.length && !data?.columns?.length) return;
      const cols = data.columns;
      const header = cols.map(escape).join(",");
      const lines = data.rows.map((r) => cols.map((c) => escape(r[c])).join(","));
      const content = "\uFEFF" + [header, ...lines].join("\n");
      const blob = new Blob([content], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "report.csv";
      a.click();
      URL.revokeObjectURL(url);
      onToast?.("Exported as CSV");
    };
    const total = result.total_count ?? 0;
    const haveAll = result.rows.length >= total;
    if (haveAll || total === 0) {
      writeCsv(result);
      return;
    }
    setExporting(true);
    onToast?.("Exporting all rows…");
    const def = buildDefinition({ offset: 0, limit: Math.min(total, 10000) });
    fetch(apiUrl(`/api/projects/${projectId}/reporting/execute`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ definition: def }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(d?.detail, "Export failed"));
        }
        return r.json();
      })
      .then((data: ExecuteReportResponse) => {
        writeCsv(data);
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : "Export failed"))
      .finally(() => setExporting(false));
  }, [projectId, result, buildDefinition, onToast]);

  const exportJson = useCallback(() => {
    if (!result) return;
    const writeJson = (data: ExecuteReportResponse) => {
      const content = JSON.stringify(
        { columns: data.columns, rows: data.rows, total_count: data.total_count },
        null,
        2
      );
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "report.json";
      a.click();
      URL.revokeObjectURL(url);
      onToast?.("Exported as JSON");
    };
    const total = result.total_count ?? 0;
    const haveAll = result.rows.length >= total;
    if (haveAll || total === 0) {
      writeJson(result);
      return;
    }
    setExporting(true);
    onToast?.("Exporting all rows…");
    const def = buildDefinition({ offset: 0, limit: Math.min(total, 10000) });
    fetch(apiUrl(`/api/projects/${projectId}/reporting/execute`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ definition: def }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(formatApiErrorDetail(d?.detail, "Export failed"));
        }
        return r.json();
      })
      .then((data: ExecuteReportResponse) => {
        writeJson(data);
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : "Export failed"))
      .finally(() => setExporting(false));
  }, [projectId, result, buildDefinition, onToast]);

  const sortFromColumns = columns.find((c) => c.sort && c.sort !== "none");
  const sortKey = sortFromColumns?.key ?? null;
  const sortDir = sortFromColumns?.sort === "asc" ? "asc" : sortFromColumns?.sort === "desc" ? "desc" : null;

  return (
    <div style={{ display: "flex", gap: 24, minHeight: "calc(100vh - 120px)", padding: 24 }}>
      {/* Left sidebar */}
      <aside style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", paddingRight: 24 }}>
        <SourcesSelector selected={sources} onChange={setSources} />
        <div style={{ marginTop: 24 }}>
          <SavedReportsList
            projectId={projectId}
            reports={savedReports}
            selectedId={selectedReportId}
            onSelect={loadSavedReport}
            onNew={() => { setSelectedReportId(null); setFilter(null); setResult(null); }}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            loadSavedReports={loadSavedReports}
            onToast={onToast}
          />
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Report Builder</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 14 }}>
          Choose sources, columns, and filters. Run to see results. Mission-scoped; no raw SQL.
        </p>

        <section style={{ marginBottom: 24 }}>
          <ColumnsBuilder
            fields={fields}
            sources={sources}
            columns={columns}
            onChange={setColumns}
          />
        </section>

        <section style={{ marginBottom: 24 }}>
          <FilterBuilder filter={filter} onChange={setFilter} fields={fields} />
        </section>

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="theme-btn theme-btn-primary"
            onClick={() => runReport()}
            disabled={loading}
          >
            {loading ? "Running…" : "Run report"}
          </button>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ marginLeft: 12, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
          >
            {[50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ padding: 12, marginBottom: 12, background: "var(--error-bg)", color: "var(--error)", borderRadius: 8 }}>
            {error}
          </div>
        )}

        <section>
          <ResultsTable
            columns={result?.columns ?? []}
            rows={result?.rows ?? []}
            totalCount={result?.total_count ?? 0}
            limit={limit}
            offset={offset}
            loading={loading}
            exporting={exporting}
            lastRunTime={lastRunTime}
            onPage={(newOffset) => { setOffset(newOffset); runReport(newOffset); }}
            onExportCsv={exportCsv}
            onExportJson={exportJson}
            onSave={() => setSaveModalOpen(true)}
            onSaveAs={handleSaveAs}
            sortKey={sortKey}
            sortDir={sortDir}
            selectedRowIndices={selectedRowIndices}
            onToggleRowSelection={toggleRowSelection}
            onSelectAllRows={selectAllRows}
            onClearRowSelection={clearRowSelection}
            onTagAll={() => { setTagBulkMode("all"); setTagPickerOpen(true); }}
            onTagSelected={() => { setTagBulkMode("selected"); setTagPickerOpen(true); }}
          />
        </section>
      </main>

      {/* Tag picker modal */}
      {tagPickerOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => !tagApplyLoading && setTagPickerOpen(false)}>
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, minWidth: 280, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>
              {tagBulkMode === "all"
                ? `Apply tag to all ${result?.rows?.length ?? 0} results`
                : `Apply tag to ${selectedRowIndices.length} selected results`}
            </h4>
            {tagPickerLoading ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading tags…</p>
            ) : reportTags.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No tags. Create tags in the Mission first.</p>
            ) : (
              <>
                <select
                  value={selectedTagIdForBulk}
                  onChange={(e) => setSelectedTagIdForBulk(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, marginBottom: 16 }}
                >
                  {reportTags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="theme-btn theme-btn-ghost" disabled={tagApplyLoading} onClick={() => setTagPickerOpen(false)}>Cancel</button>
                  <button
                    type="button"
                    className="theme-btn theme-btn-primary"
                    disabled={tagApplyLoading || !selectedTagIdForBulk}
                    onClick={() => {
                      const rows = result?.rows ?? [];
                      const toTag = tagBulkMode === "all" ? rows : selectedRowIndices.map((i) => rows[i]).filter(Boolean);
                      const assignments = toTag
                        .map((r: Record<string, unknown>) => ({ target_type: r._target_type, target_id: r._target_id }))
                        .filter((a: { target_type?: unknown; target_id?: unknown }) => a.target_id);
                      if (assignments.length === 0) {
                        onToast?.("No valid targets to tag");
                        return;
                      }
                      setTagApplyLoading(true);
                      fetch(apiUrl(`/api/projects/${projectId}/item-tags/bulk`), {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tag_id: selectedTagIdForBulk, assignments }),
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

      {/* Save modal */}
      {(saveModalOpen || saveAsModalOpen) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, minWidth: 320 }}>
            <h3 style={{ margin: "0 0 16px" }}>Save report</h3>
            <input
              type="text"
              placeholder="Report name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", marginBottom: 10, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)" }}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => { setSaveModalOpen(false); setSaveAsModalOpen(false); }}>
                Cancel
              </button>
              <button type="button" className="theme-btn theme-btn-primary" disabled={!saveName.trim() || saving} onClick={handleSaveNew}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

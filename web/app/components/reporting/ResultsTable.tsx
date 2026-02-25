"use client";

type Props = {
  columns: string[];
  rows: Record<string, unknown>[];
  totalCount: number;
  limit: number;
  offset: number;
  loading: boolean;
  exporting?: boolean;
  lastRunTime: string | null;
  onPage: (newOffset: number) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSort?: (key: string) => void;
  sortKey?: string | null;
  sortDir?: "asc" | "desc" | null;
  /** Row selection for "Tag selected" */
  selectedRowIndices?: number[];
  onToggleRowSelection?: (index: number) => void;
  onSelectAllRows?: () => void;
  onClearRowSelection?: () => void;
  onTagAll?: () => void;
  onTagSelected?: () => void;
};

export function ResultsTable({
  columns,
  rows,
  totalCount,
  limit,
  offset,
  loading,
  exporting = false,
  lastRunTime,
  onPage,
  onExportCsv,
  onExportJson,
  onSave,
  onSaveAs,
  onSort,
  sortKey,
  sortDir,
  selectedRowIndices = [],
  onToggleRowSelection,
  onSelectAllRows,
  onClearRowSelection,
  onTagAll,
  onTagSelected,
}: Props) {
  const pageIndex = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const showSelection = onToggleRowSelection != null;
  const allSelected = rows.length > 0 && selectedRowIndices.length === rows.length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {loading ? "Loading…" : lastRunTime ? `Last run: ${lastRunTime}` : "Run report to see results"}
          {!loading && rows.length > 0 && ` · ${rows.length} of ${totalCount} results`}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onTagAll != null && (
            <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onTagAll} disabled={!rows.length}>
              Tag all
            </button>
          )}
          {onTagSelected != null && (
            <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onTagSelected} disabled={selectedRowIndices.length === 0}>
              Tag selected
            </button>
          )}
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onExportCsv} disabled={!rows.length || exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onExportJson} disabled={!rows.length || exporting}>
            {exporting ? "Exporting…" : "Export JSON"}
          </button>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onSave}>
            Save
          </button>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onSaveAs}>
            Save As
          </button>
        </div>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 400, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-panel)", zIndex: 1 }}>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {showSelection && (
                <th style={{ padding: "10px 12px", width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => (allSelected ? onClearRowSelection?.() : onSelectAllRows?.())}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    cursor: onSort ? "pointer" : undefined,
                  }}
                  onClick={() => onSort?.(col)}
                >
                  {col}
                  {sortKey === col && (sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                {showSelection && (
                  <td style={{ padding: "8px 12px", width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedRowIndices.includes(i)}
                      onChange={() => onToggleRowSelection?.(i)}
                      aria-label={`Select row ${i + 1}`}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col} style={{ padding: "8px 12px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row[col] != null ? String(row[col]) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
            No rows. Adjust filters or run the report.
          </div>
        )}
      </div>
      {totalCount > limit && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            disabled={offset <= 0 || loading}
            onClick={() => onPage(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Page {pageIndex} of {totalPages}
          </span>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            disabled={offset + limit >= totalCount || loading}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

type Props = {
  columns: string[];
  rows: Record<string, unknown>[];
  totalCount: number;
  limit: number;
  offset: number;
  loading: boolean;
  lastRunTime: string | null;
  onPage: (newOffset: number) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSort?: (key: string) => void;
  sortKey?: string | null;
  sortDir?: "asc" | "desc" | null;
};

export function ResultsTable({
  columns,
  rows,
  totalCount,
  limit,
  offset,
  loading,
  lastRunTime,
  onPage,
  onExportCsv,
  onExportJson,
  onSave,
  onSaveAs,
  onSort,
  sortKey,
  sortDir,
}: Props) {
  const pageIndex = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {loading ? "Loading…" : lastRunTime ? `Last run: ${lastRunTime}` : "Run report to see results"}
          {!loading && rows.length > 0 && ` · ${rows.length} of ${totalCount} results`}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onExportCsv} disabled={!rows.length}>
            Export CSV
          </button>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={onExportJson} disabled={!rows.length}>
            Export JSON
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

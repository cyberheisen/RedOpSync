"use client";

import { useState } from "react";
import { apiUrl } from "../../lib/api";
import type { SavedReportItem } from "../../lib/reporting-types";

type Props = {
  projectId: string;
  reports: SavedReportItem[];
  selectedId: string | null;
  onSelect: (report: SavedReportItem) => void;
  onNew: () => void;
  onDuplicate: (report: SavedReportItem) => void;
  onDelete: (report: SavedReportItem) => void;
  loadSavedReports: () => void;
  onToast?: (msg: string) => void;
};

export function SavedReportsList({
  projectId,
  reports,
  selectedId,
  onSelect,
  onNew,
  onDuplicate,
  onDelete,
  loadSavedReports,
  onToast,
}: Props) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? reports.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          (r.description || "").toLowerCase().includes(search.toLowerCase())
      )
    : reports;

  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem", fontWeight: 600 }}>Saved Reports</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className="theme-btn theme-btn-primary" style={{ flex: 1, fontSize: 12, minWidth: 60 }} onClick={onNew}>
          New
        </button>
        {projectId && (
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => {
              fetch(apiUrl(`/api/projects/${projectId}/reporting/seed-examples`), { method: "POST", credentials: "include" })
                .then((r) => r.ok ? r.json() : {})
                .then((d: { created?: number }) => {
                  if (d.created) loadSavedReports();
                  onToast?.(d.created ? `Created ${d.created} example report(s)` : "Examples already exist");
                })
                .catch(() => onToast?.("Failed to create examples"));
            }}
          >
            Seed examples
          </button>
        )}
      </div>
      <input
        type="text"
        placeholder="Search reports…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: 12,
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg-panel)",
          color: "var(--text)",
          marginBottom: 10,
        }}
      />
      <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 280, overflowY: "auto" }}>
        {filtered.map((r) => (
          <li
            key={r.id}
            style={{
              padding: "8px 10px",
              marginBottom: 4,
              borderRadius: 6,
              background: selectedId === r.id ? "var(--bg-selected)" : "var(--bg-panel)",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            <div
              style={{ fontSize: 13, fontWeight: 500 }}
              onClick={() => onSelect(r)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(r)}
              role="button"
              tabIndex={0}
            >
              {r.name}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button
                type="button"
                className="theme-btn theme-btn-ghost"
                style={{ fontSize: 11, padding: "2px 6px" }}
                onClick={(e) => { e.stopPropagation(); onDuplicate(r); }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="theme-btn theme-btn-ghost"
                style={{ fontSize: 11, padding: "2px 6px", color: "var(--error)" }}
                onClick={(e) => { e.stopPropagation(); onDelete(r); }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No saved reports</p>
      )}
    </div>
  );
}

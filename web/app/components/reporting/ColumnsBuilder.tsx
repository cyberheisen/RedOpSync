"use client";

import { useState, useRef } from "react";
import type { ReportColumnSpec, FieldMetadata, SourceId } from "../../lib/reporting-types";
import { DEFAULT_COLUMN_KEYS } from "../../lib/reporting-types";

type ColumnWithSort = ReportColumnSpec & { sort?: "asc" | "desc" | "none" };

type Props = {
  fields: FieldMetadata[];
  sources: SourceId[];
  columns: ColumnWithSort[];
  onChange: (columns: ColumnWithSort[]) => void;
};

function groupFieldsBySource(fields: FieldMetadata[]): Record<string, FieldMetadata[]> {
  const bySource: Record<string, FieldMetadata[]> = {};
  for (const f of fields) {
    const s = f.source || "core";
    if (!bySource[s]) bySource[s] = [];
    bySource[s].push(f);
  }
  return bySource;
}

export function ColumnsBuilder({ fields, sources, columns, onChange }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const bySource = groupFieldsBySource(fields);
  const sourceOrder = ["core", "nmap", "http", "gowitness", "whois", "tls", "notes"];
  const orderedSources = sourceOrder.filter((s) => bySource[s]?.length);

  const addColumn = (key: string, label?: string) => {
    if (columns.some((c) => c.key === key)) return;
    onChange([...columns, { key, label: label || key, sort: "none" }]);
    setDropdownOpen(false);
  };

  const removeColumn = (index: number) => {
    onChange(columns.filter((_, i) => i !== index));
  };

  const setSort = (index: number, sort: "asc" | "desc" | "none") => {
    const next = columns.map((c, i) => (i === index ? { ...c, sort } : c));
    onChange(next);
  };

  const cycleSort = (index: number) => {
    const current = columns[index]?.sort ?? "none";
    const next: "asc" | "desc" | "none" = current === "none" ? "asc" : current === "asc" ? "desc" : "none";
    setSort(index, next);
  };

  const resetDefault = () => {
    const defaultCols: ColumnWithSort[] = DEFAULT_COLUMN_KEYS.filter((key) =>
      fields.some((f) => f.key === key)
    ).map((key) => {
      const f = fields.find((x) => x.key === key);
      return { key, label: f?.label ?? key, sort: "none" as const };
    });
    onChange(defaultCols);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex == null) return;
    if (draggedIndex === index) return;
    const newCols = [...columns];
    const [removed] = newCols.splice(draggedIndex, 1);
    newCols.splice(index, 0, removed);
    onChange(newCols);
    setDraggedIndex(index);
  };
  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Columns</h3>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            + Add column
          </button>
          {dropdownOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
                onClick={() => setDropdownOpen(false)}
                aria-hidden
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "100%",
                  marginTop: 4,
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  zIndex: 20,
                  maxHeight: 320,
                  overflowY: "auto",
                  minWidth: 220,
                }}
              >
                {orderedSources.map((source) => (
                  <div key={source}>
                    <div style={{ padding: "6px 10px", fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                      {source}
                    </div>
                    {(bySource[source] || []).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "6px 12px",
                          textAlign: "left",
                          fontSize: 12,
                          background: "none",
                          border: "none",
                          color: "var(--text)",
                          cursor: "pointer",
                        }}
                        onClick={() => addColumn(f.key, f.label)}
                      >
                        {f.label || f.key}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={resetDefault}>
          Reset to default
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {columns.map((col, index) => (
          <div
            key={`${col.key}-${index}`}
            ref={index === draggedIndex ? dragNode : undefined}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              cursor: "grab",
            }}
          >
            <span>{col.label || col.key}</span>
            <button
              type="button"
              onClick={() => cycleSort(index)}
              style={{ padding: "0 4px", fontSize: 10 }}
              title={columns[index]?.sort === "asc" ? "Ascending" : columns[index]?.sort === "desc" ? "Descending" : "No sort"}
            >
              {columns[index]?.sort === "asc" ? "↑" : columns[index]?.sort === "desc" ? "↓" : "↕"}
            </button>
            <button
              type="button"
              onClick={() => removeColumn(index)}
              style={{ padding: "0 2px", fontSize: 14, lineHeight: 1 }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo, useRef, useEffect } from "react";

/** Options as [id, label] tuples (e.g. from builder/columns API). */
type Props = {
  options: [string, string][];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  triggerLabel?: string;
  disabled?: boolean;
};

export function ColumnPicker({
  options,
  selected,
  onChange,
  placeholder = "Search columns…",
  triggerLabel,
  disabled,
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      ([id, label]) =>
        id.toLowerCase().includes(q) || label.toLowerCase().includes(q)
    );
  }, [options, search]);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectAll = () => {
    const ids = (options ?? []).map(([id]) => id);
    onChange(ids.length ? ids : []);
  };

  const clearAll = () => {
    onChange([]);
  };

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  const summary =
    triggerLabel ??
    (selected.length === 0
      ? "Choose columns…"
      : selected.length === options.length
        ? "All columns"
        : `${selected.length} column${selected.length === 1 ? "" : "s"}`);

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: 200 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) setOpen((o) => !o);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          border: "1px solid var(--border)",
          borderRadius: 6,
          backgroundColor: "var(--bg-panel)",
          color: "var(--text)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          fontSize: 14,
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>{summary}</span>
        <span style={{ transform: open ? "rotate(180deg)" : undefined, fontSize: 10 }}>▼</span>
      </div>
      {open && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              backgroundColor: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              zIndex: 1000,
              overflow: "hidden",
            }}
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="theme-input"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 12px",
                border: "none",
                borderBottom: "1px solid var(--border)",
                borderRadius: 0,
                fontSize: 13,
              }}
            />
            <div style={{ display: "flex", gap: 8, padding: "6px 12px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={selectAll}>
                Select all
              </button>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={clearAll}>
                Clear
              </button>
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 13 }}>
                  No columns match
                </div>
              ) : (
                filtered.map(([id, label]) => (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() => toggle(id)}
                    />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

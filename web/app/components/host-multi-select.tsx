"use client";

import { useState, useMemo } from "react";

type Host = { id: string; ip: string; dns_name: string | null };

type Props = {
  hosts: Host[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function HostMultiSelect({ hosts, selectedIds, onChange, placeholder = "Search hosts…", disabled }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return hosts;
    return hosts.filter(
      (h) =>
        h.ip.toLowerCase().includes(q) ||
        (h.dns_name?.toLowerCase().includes(q) ?? false)
    );
  }, [hosts, search]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const label = (h: Host) => (h.dns_name ? `${h.ip} (${h.dns_name})` : h.ip);

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          backgroundColor: "var(--bg)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          minHeight: 38,
        }}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => {
            e.stopPropagation();
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="theme-input"
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            padding: 0,
            outline: "none",
          }}
        />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {selectedIds.size} selected
        </span>
        <span style={{ transform: open ? "rotate(180deg)" : undefined }}>▼</span>
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
              maxHeight: 200,
              overflowY: "auto",
              backgroundColor: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              zIndex: 1000,
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 13 }}>
                No hosts match
              </div>
            ) : (
              filtered.map((h) => (
                <label
                  key={h.id}
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
                    checked={selectedIds.has(h.id)}
                    onChange={() => toggle(h.id)}
                  />
                  <span style={{ fontSize: 13 }}>{label(h)}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

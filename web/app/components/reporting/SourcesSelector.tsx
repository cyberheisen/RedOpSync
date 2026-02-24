"use client";

import type { SourceId } from "../../lib/reporting-types";
import { SOURCE_LABELS } from "../../lib/reporting-types";

const SOURCE_IDS: SourceId[] = ["core", "nmap", "http", "gowitness", "whois", "tls", "notes"];

type Props = {
  selected: SourceId[];
  onChange: (selected: SourceId[]) => void;
};

export function SourcesSelector({ selected, onChange }: Props) {
  const toggle = (id: SourceId) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id].sort());
    }
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem", fontWeight: 600 }}>Sources</h3>
      <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--text-muted)" }}>
        Select data sources to include. Only fields from these sources appear in columns and filters.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {SOURCE_IDS.map((id) => (
          <li key={id} style={{ marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={() => toggle(id)}
              />
              <span>{SOURCE_LABELS[id]}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

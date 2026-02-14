"use client";

import { useState, useMemo } from "react";

type SplitMode = "lines" | "blocks";

export function ToolsDeduplicationPanel() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<SplitMode>("lines");

  const { output, removedCount } = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { output: "", removedCount: 0 };

    if (mode === "lines") {
      const lines = raw.split(/\r?\n/);
      const seen = new Set<string>();
      const kept: string[] = [];
      for (const line of lines) {
        if (seen.has(line)) continue;
        seen.add(line);
        kept.push(line);
      }
      return { output: kept.join("\n"), removedCount: lines.length - kept.length };
    }

    const blocks = raw.split(/\n\s*\n/);
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const block of blocks) {
      const normalized = block.trim();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      kept.push(block);
    }
    return { output: kept.join("\n\n"), removedCount: blocks.length - kept.length };
  }, [input, mode]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Deduplication</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
        Paste or type text; duplicates are removed. Choose whether to deduplicate by line or by block (paragraphs).
      </p>
      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 16, fontSize: 13 }}>
          <input type="radio" checked={mode === "lines"} onChange={() => setMode("lines")} style={{ marginRight: 6 }} />
          By line
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="radio" checked={mode === "blocks"} onChange={() => setMode("blocks")} style={{ marginRight: 6 }} />
          By block (double newline)
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Input</label>
        <textarea
          className="theme-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste or type text…"
          rows={10}
          style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
          Output {removedCount > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({removedCount} duplicate{removedCount === 1 ? "" : "s"} removed)</span>}
        </div>
        <textarea
          className="theme-input"
          value={output}
          readOnly
          rows={10}
          style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
        />
      </div>
    </div>
  );
}

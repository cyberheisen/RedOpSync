"use client";

import { useState, useMemo } from "react";

type ToolsPrettifyPanelProps = {
  variant: "json" | "javascript";
};

export function ToolsPrettifyPanel({ variant }: ToolsPrettifyPanelProps) {
  const [input, setInput] = useState("");

  const { output, error } = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { output: "", error: "" };

    if (variant === "json") {
      try {
        const parsed = JSON.parse(raw);
        return { output: JSON.stringify(parsed, null, 2), error: "" };
      } catch (e) {
        return { output: "", error: (e as SyntaxError).message };
      }
    }

    try {
      const formatted = formatJavaScript(raw);
      return { output: formatted, error: "" };
    } catch (e) {
      return { output: "", error: (e as Error).message };
    }
  }, [input, variant]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>
        Prettify {variant === "json" ? "JSON" : "JavaScript"}
      </h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
        Paste raw {variant === "json" ? "JSON" : "JavaScript"} below; it will be formatted for readability.
      </p>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Input</label>
        <textarea
          className="theme-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={variant === "json" ? '{"key": "value", …}' : "function example() { … }"}
          rows={12}
          style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Formatted output</div>
        {error && <div style={{ marginBottom: 8, fontSize: 13, color: "var(--error, #ef4444)" }}>{error}</div>}
        <textarea
          className="theme-input"
          value={output}
          readOnly
          rows={12}
          style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
        />
      </div>
    </div>
  );
}

function formatJavaScript(code: string): string {
  const lines = code.split(/\r?\n/);
  let depth = 0;
  const indentSize = 2;
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === "") {
      out.push("");
      continue;
    }
    const startsWithClose = /^\s*[\}\]]/.test(trimmed);
    if (startsWithClose) depth = Math.max(0, depth - 1);
    out.push(" ".repeat(depth * indentSize) + trimmed);
    const endsWithOpen = /[\{\[]\s*$/.test(trimmed);
    const onlyClose = /^[\}\]]\s*$/.test(trimmed);
    if (endsWithOpen && !onlyClose) depth += 1;
    if (startsWithClose && /[\{\[]\s*$/.test(trimmed)) depth += 1;
  }
  return out.join("\n");
}

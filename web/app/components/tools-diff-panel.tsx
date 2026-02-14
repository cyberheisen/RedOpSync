"use client";

import { useState, useMemo } from "react";
import { diffLines, diffChars, type Change } from "diff";

export function ToolsDiffPanel() {
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [mode, setMode] = useState<"lines" | "chars">("lines");

  const diffResult = useMemo((): Change[] => {
    if (mode === "lines") return diffLines(textA, textB);
    return diffChars(textA, textB);
  }, [textA, textB, mode]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Diff</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
        Paste or type text in both boxes; differences are highlighted below.
      </p>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Text A</label>
          <textarea
            className="theme-input"
            value={textA}
            onChange={(e) => setTextA(e.target.value)}
            placeholder="Paste or type first text…"
            rows={8}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Text B</label>
          <textarea
            className="theme-input"
            value={textB}
            onChange={(e) => setTextB(e.target.value)}
            placeholder="Paste or type second text…"
            rows={8}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, marginRight: 12 }}>
          <input
            type="radio"
            checked={mode === "lines"}
            onChange={() => setMode("lines")}
            style={{ marginRight: 6 }}
          />
          By line
        </label>
        <label style={{ fontSize: 13 }}>
          <input
            type="radio"
            checked={mode === "chars"}
            onChange={() => setMode("chars")}
            style={{ marginRight: 6 }}
          />
          By character
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Difference</div>
        <div
          className="theme-input"
          style={{
            padding: 12,
            minHeight: 120,
            fontSize: 13,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            overflow: "auto",
          }}
        >
          {diffResult.length === 0 && !textA && !textB && (
            <span style={{ color: "var(--text-muted)" }}>Enter text in both boxes to see the diff.</span>
          )}
          {diffResult.map((part, i) => {
            if (part.added) {
              return (
                <span key={i} style={{ backgroundColor: "rgba(34, 197, 94, 0.25)", textDecoration: "none" }}>
                  {part.value}
                </span>
              );
            }
            if (part.removed) {
              return (
                <span key={i} style={{ backgroundColor: "rgba(239, 68, 68, 0.25)", textDecoration: "line-through" }}>
                  {part.value}
                </span>
              );
            }
            return <span key={i}>{part.value}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

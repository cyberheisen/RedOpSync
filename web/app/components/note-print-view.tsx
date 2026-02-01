"use client";

import { useEffect } from "react";
import { renderMarkdown } from "../lib/markdown";

type Attachment = { id: string; filename: string; type: string; url?: string };

type Props = {
  noteTitle: string | null;
  contextLabel: string;
  bodyMd: string | null;
  attachments: Attachment[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  onClose: () => void;
};

export function NotePrintView({
  noteTitle,
  contextLabel,
  bodyMd,
  attachments,
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
  onClose,
}: Props) {
  useEffect(() => {
    window.print();
  }, []);

  const html = renderMarkdown(bodyMd ?? "");

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .note-print-root, .note-print-root * { visibility: visible; }
          .note-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; color: #1a1a1a !important; }
        }
      `}</style>
      <div
        className="note-print-root"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "var(--bg)",
          color: "var(--text)",
          zIndex: 1001,
          overflow: "auto",
        }}
      >
        <div className="note-print-actions" style={{ marginBottom: 16, padding: 16, borderBottom: "1px solid var(--border)" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
            ← Close print view
          </button>
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem", padding: "0 24px" }}>{noteTitle || "Untitled Note"}</h1>
        <p style={{ margin: "0 0 24px", color: "var(--text-muted)", fontSize: 14, padding: "0 24px" }}>
          {contextLabel}
        </p>
        <div style={{ marginBottom: 24, fontSize: 13, color: "var(--text-muted)", padding: "0 24px" }}>
          <div>Created by {createdBy} on {createdAt}</div>
          <div>Last updated by {updatedBy} on {updatedAt}</div>
        </div>
        <div
          style={{ marginBottom: 24, lineHeight: 1.6, padding: "0 24px" }}
          dangerouslySetInnerHTML={{ __html: html || "<em>No content</em>" }}
        />
        {attachments.length > 0 && (
          <div style={{ marginTop: 24, padding: "24px", borderTop: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Attachments</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {attachments.map((a) => (
                <div key={a.id} style={{ marginBottom: 8 }}>
                  {a.type.startsWith("image/") && a.url ? (
                    <div>
                      <img src={a.url} alt={a.filename} style={{ maxWidth: 300, maxHeight: 200, objectFit: "contain", border: "1px solid #ddd" }} />
                      <div style={{ fontSize: 12, marginTop: 4 }}>{a.filename}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14 }}>{a.filename}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

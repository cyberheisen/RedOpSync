"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "../lib/api";

type Attachment = {
  id: string;
  filename: string;
  caption: string | null;
  mime: string | null;
  size: number | null;
  is_pasted: boolean;
  source: string | null;
  uploaded_by_username: string | null;
  created_at: string;
};

type Props = {
  portId: string;
  canEdit: boolean;
  onRefresh?: () => void;
};

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return "—";
  }
}

function isImage(mime: string | null): boolean {
  return !!(mime && mime.toLowerCase().startsWith("image/"));
}

export function PortAttachmentsSection({ portId, canEdit, onRefresh }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pasteTarget, setPasteTarget] = useState<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(apiUrl(`/api/ports/${portId}/attachments`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Attachment[]) => {
        // Exclude gowitness evidence — it belongs in the tree, not here
        setAttachments((data || []).filter((a) => (a.source || "").toLowerCase() !== "gowitness"));
      })
      .finally(() => setLoading(false));
  }, [portId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canEdit) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiUrl(`/api/ports/${portId}/attachments`), {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (res.ok) {
        load();
        onRefresh?.();
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || !canEdit) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          setUploading(true);
          try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(apiUrl(`/api/ports/${portId}/attachments/paste`), {
              method: "POST",
              credentials: "include",
              body: fd,
            });
            if (res.ok) {
              load();
              onRefresh?.();
            }
          } finally {
            setUploading(false);
          }
          return;
        }
      }
    },
    [portId, canEdit, load, onRefresh]
  );

  useEffect(() => {
    const el = pasteTarget;
    if (!el) return;
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, [pasteTarget, handlePaste]);

  const handleDelete = async (attId: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(apiUrl(`/api/ports/${portId}/attachments/${attId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        load();
        onRefresh?.();
      }
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Attachments</h3>
      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
      ) : (
        <>
          {canEdit && (
            <div
              ref={setPasteTarget}
              tabIndex={0}
              style={{
                marginBottom: 12,
                padding: 12,
                border: "1px dashed var(--border)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              <label style={{ cursor: "pointer", display: "inline-block", marginRight: 12 }}>
                <input type="file" accept="image/*,.pdf,.txt,.md" style={{ display: "none" }} onChange={handleFileUpload} disabled={uploading} />
                <span className="theme-link">{uploading ? "Uploading…" : "Upload file"}</span>
              </label>
              <span> or paste screenshot (Ctrl/Cmd+V) here</span>
            </div>
          )}
          {attachments.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No attachments yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {attachments.map((a) => (
                <li
                  key={a.id}
                  style={{
                    marginBottom: 8,
                    padding: 12,
                    backgroundColor: "var(--bg-panel)",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    {isImage(a.mime) ? (
                      <a
                        href={apiUrl(`/api/ports/${portId}/attachments/${a.id}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ flexShrink: 0 }}
                      >
                        <img
                          src={apiUrl(`/api/ports/${portId}/attachments/${a.id}`)}
                          alt={a.caption || a.filename}
                          style={{
                            width: 64,
                            height: 64,
                            objectFit: "cover",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                          }}
                        />
                      </a>
                    ) : null}
                    <div style={{ minWidth: 0 }}>
                      {isImage(a.mime) ? (
                        <a
                          href={apiUrl(`/api/ports/${portId}/attachments/${a.id}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="theme-link"
                        >
                          {a.caption || (a.is_pasted ? "Pasted Screenshot" : a.filename)}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 500 }}>
                          {a.caption || a.filename}
                        </span>
                      )}
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {a.uploaded_by_username ?? "—"} • {formatDate(a.created_at)}
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={() => handleDelete(a.id)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

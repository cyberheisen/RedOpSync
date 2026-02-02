"use client";

import { useState, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";

type PendingFile = { file: File; id: string; isPasted: boolean };

type Props = {
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

export type PendingAttachmentsHandle = {
  addFile: (file: File, isPasted?: boolean) => void;
};

function isImage(mime: string | null): boolean {
  return !!(mime && mime.toLowerCase().startsWith("image/"));
}

export const PendingAttachmentsSection = forwardRef<PendingAttachmentsHandle, Props>(function PendingAttachmentsSection({ onChange, disabled }, ref) {
  const [pending, setPending] = useState<PendingFile[]>([]);

  useEffect(() => {
    onChange(pending.map((p) => p.file));
  }, [pending, onChange]);

  const addFile = useCallback((file: File, isPasted = false) => {
    setPending((prev) => [...prev, { file, id: Math.random().toString(36).slice(2), isPasted }]);
  }, []);

  useImperativeHandle(ref, () => ({ addFile }), [addFile]);

  const remove = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;
    addFile(file, false);
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type.startsWith("image/") ||
          f.type === "application/pdf" ||
          f.name.endsWith(".txt") ||
          f.name.endsWith(".md")
      );
      files.forEach((f) => addFile(f, false));
    },
    [addFile, disabled]
  );

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  return (
    <div>
      <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Attachments</h3>
      {!disabled && (
        <div
          tabIndex={0}
          onPaste={(e) => {
            const ev = e.nativeEvent as ClipboardEvent;
            const items = ev.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                ev.preventDefault();
                const file = item.getAsFile();
                if (file) addFile(file, true);
                return;
              }
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
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
            <input type="file" accept="image/*,.pdf,.txt,.md" style={{ display: "none" }} onChange={handleFileUpload} disabled={disabled} />
            <span className="theme-link">Upload file</span>
          </label>
          <span> or paste / drop screenshot here</span>
        </div>
      )}
      {pending.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No attachments yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {pending.map((p) => (
            <li
              key={p.id}
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
                {isImage(p.file.type) ? (
                  <img
                    src={URL.createObjectURL(p.file)}
                    alt=""
                    style={{
                      width: 64,
                      height: 64,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                    }}
                  />
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <span>{p.isPasted ? "Pasted Screenshot" : p.file.name}</span>
                </div>
              </div>
              {!disabled && (
                <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 12 }} onClick={() => remove(p.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Heading, Link, Table as TableIcon } from "lucide-react";
import { renderMarkdown } from "../lib/markdown";

export type NoteAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
};

type Props = {
  /** Display label for the note context (e.g. "Scope", "Subnet: 10.0.0.0/24", "Host: 10.0.0.1") */
  contextLabel: string;
  note?: {
    id: string;
    title?: string | null;
    body_md: string | null;
  } | null;
  onClose: () => void;
  onSave: (title: string, bodyMd: string, attachments: NoteAttachment[]) => Promise<void>;
};

const ACCEPT = ".png,.jpg,.jpeg,.txt,.pdf";

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg"].includes((ext ?? ""))) return "🖼";
  if (ext === "pdf") return "📄";
  if (ext === "txt") return "📝";
  return "📎";
}

export function NoteEditorPanel({ contextLabel, note, onClose, onSave }: Props) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [bodyMd, setBodyMd] = useState(note?.body_md ?? "");
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const applyInsert = (newText: string, cursorStart: number, cursorEnd: number) => {
    setBodyMd(newText);
    requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus();
      bodyTextareaRef.current?.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const insertBold = () => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const v = bodyMd;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = v.slice(start, end);
    const inner = sel || "";
    const newText = v.slice(0, start) + "**" + inner + "**" + v.slice(end);
    const pos = start + 2 + inner.length;
    applyInsert(newText, pos, pos);
  };

  const insertItalic = () => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const v = bodyMd;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = v.slice(start, end);
    const inner = sel || "";
    const newText = v.slice(0, start) + "*" + inner + "*" + v.slice(end);
    const pos = start + 1 + inner.length;
    applyInsert(newText, pos, pos);
  };

  const insertHeader = () => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const v = bodyMd;
    const start = ta.selectionStart;
    const lineStart = v.slice(0, start).lastIndexOf("\n") + 1;
    const newText = v.slice(0, lineStart) + "## " + v.slice(lineStart);
    const pos = lineStart + 3;
    applyInsert(newText, pos, pos);
  };

  const insertLink = () => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const v = bodyMd;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = v.slice(start, end);
    if (sel) {
      const newText = v.slice(0, start) + "[" + sel + "]()" + v.slice(end);
      const pos = start + 2 + sel.length + 2;
      applyInsert(newText, pos, pos);
    } else {
      const newText = v.slice(0, start) + "[text](url)" + v.slice(start);
      applyInsert(newText, start + 1, start + 5);
    }
  };

  const insertTable = () => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const v = bodyMd;
    const start = ta.selectionStart;
    const prefix = start > 0 && v[start - 1] !== "\n" ? "\n" : "";
    const header = "| Col1 | Col2 |";
    const separator = "\n| --- | --- |";
    const bodyRow = "\n|  |  |";
    const template = `${prefix}${header}${separator}${bodyRow}`;
    const newText = v.slice(0, start) + template + v.slice(start);
    const cursorPos = start + prefix.length + header.length + separator.length + 2;
    applyInsert(newText, cursorPos, cursorPos);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const allowed = /\.(png|jpg|jpeg|txt|pdf)$/i;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (allowed.test(f.name)) {
        const id = `${Date.now()}-${i}`;
        const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
        setAttachments((prev) => [...prev, { id, file: f, previewUrl }]);
      }
    }
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(title.trim(), bodyMd, attachments);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    onClose();
  };

  const previewHtml = renderMarkdown(bodyMd);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{note ? "Edit note" : "Add note"}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
            {contextLabel}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="note-editor-form"
            className="theme-btn theme-btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <form
        id="note-editor-form"
        onSubmit={handleSave}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          gap: 16,
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Initial Recon"
            className="theme-input"
            style={{ maxWidth: 400 }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <label style={{ fontSize: 14 }}>Body (markdown)</label>
            <button
              type="button"
              className="theme-btn theme-btn-ghost"
              style={{ fontSize: 12, padding: "4px 8px" }}
              onClick={() => setShowPreview((p) => !p)}
            >
              {showPreview ? "Edit" : "Preview"}
            </button>
          </div>
          {showPreview ? (
            <div
              className="note-markdown-preview"
              style={{
                flex: 1,
                minHeight: 200,
                padding: 16,
                backgroundColor: "var(--bg-panel)",
                borderRadius: 6,
                border: "1px solid var(--border)",
                overflowY: "auto",
                fontSize: 14,
                lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml || "<em>No content</em>" }}
            />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 6,
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="theme-btn theme-btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={insertBold}
                  title="Bold"
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  className="theme-btn theme-btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={insertItalic}
                  title="Italic"
                >
                  <Italic size={16} />
                </button>
                <button
                  type="button"
                  className="theme-btn theme-btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={insertHeader}
                  title="Heading"
                >
                  <Heading size={16} />
                </button>
                <button
                  type="button"
                  className="theme-btn theme-btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={insertLink}
                  title="Link"
                >
                  <Link size={16} />
                </button>
                <button
                  type="button"
                  className="theme-btn theme-btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={insertTable}
                  title="Table"
                >
                  <TableIcon size={16} />
                </button>
              </div>
              <textarea
                ref={bodyTextareaRef}
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                placeholder="Supports markdown: headings, **bold**, *italic*, `code`, lists, [links](url), tables"
                className="theme-input"
                style={{
                  flex: 1,
                  minHeight: 200,
                  resize: "none",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 14,
                }}
              />
            </>
          )}
        </div>

        <div style={{ flexShrink: 0 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Attachments</label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            style={{ marginBottom: 8 }}
          >
            Add file (png, jpg, txt, pdf)
          </button>
          {attachments.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {attachments.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    backgroundColor: "var(--bg-panel)",
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{getFileIcon(a.file.name)}</span>
                  <span style={{ flex: 1, fontSize: 14 }}>{a.file.name}</span>
                  <button
                    type="button"
                    className="theme-btn theme-btn-ghost"
                    style={{ padding: "2px 8px", fontSize: 12, color: "var(--error)" }}
                    onClick={() => removeAttachment(a.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </div>
  );
}

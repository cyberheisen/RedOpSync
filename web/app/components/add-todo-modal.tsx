"use client";

import { useState } from "react";
import { apiUrl, formatApiErrorDetail } from "../lib/api";

type UserOption = { id: string; username: string; role: string };

export type TodoParentType = "scope" | "subnet" | "host" | "host_ports" | "port" | "vulnerabilities" | "vulnerability_definition";

type AddTodoModalProps = {
  projectId: string;
  parentType: TodoParentType;
  parentId?: string | null;
  contextLabel?: string;
  users?: UserOption[];
  onClose: () => void;
  onSaved: () => void;
  onToast?: (msg: string) => void;
};

export function AddTodoModal({
  projectId,
  parentType,
  parentId,
  contextLabel,
  users = [],
  onClose,
  onSaved,
  onToast,
}: AddTodoModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    fetch(apiUrl("/api/todos"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: t,
        description: description.trim() || null,
        target_type: parentType,
        target_id: parentId || null,
        assigned_to_user_id: assignedToUserId || null,
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(formatApiErrorDetail(d?.detail, "Create failed")); });
        return r.json();
      })
      .then(() => {
        onSaved();
        onToast?.("Todo added");
        onClose();
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : "Failed to create"))
      .finally(() => setSaving(false));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 24,
          minWidth: 320,
          maxWidth: 420,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Add Todo</h3>
        {contextLabel && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            Linked to: {contextLabel}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Title</label>
            <input
              className="theme-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Todo title"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Description (optional)</label>
            <input
              className="theme-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
            />
          </div>
          {users.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Assign to</label>
              <select
                className="theme-select"
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="theme-btn theme-btn-primary" disabled={!title.trim() || saving}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

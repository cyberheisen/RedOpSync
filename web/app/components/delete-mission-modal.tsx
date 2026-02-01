"use client";

import { useState } from "react";

type Props = {
  missionName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteMissionModal({ missionName, onClose, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === missionName;
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches || deleting) return;
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--bg-panel)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          padding: 24,
          maxWidth: 400,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete mission</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>Type the mission name to confirm deletion</p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={missionName}
              className="theme-input"
              style={{ borderColor: matches ? "var(--accent)" : undefined }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="theme-btn theme-btn-primary"
              disabled={!matches || deleting}
              style={
                matches && !deleting
                  ? { backgroundColor: "var(--error)", borderColor: "var(--error)" }
                  : undefined
              }
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

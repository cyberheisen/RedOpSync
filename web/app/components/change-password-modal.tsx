"use client";

import { useState } from "react";
import { apiUrl, formatApiErrorDetail } from "../lib/api";

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  /** When true, user must change password (e.g. first login); modal cannot be dismissed without changing. */
  required?: boolean;
};

export function ChangePasswordModal({ onClose, onSuccess, required }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }
    const newTrimmed = newPassword.trim();
    if (newTrimmed.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword.trim(),
          new_password: newTrimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatApiErrorDetail(data.detail, "Failed to change password"));
        setSaving(false);
        return;
      }
      onSuccess?.();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
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
      onClick={required ? undefined : onClose}
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>
          {required ? "You must change your password" : "Change Password"}
        </h2>
        {required && (
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>
            Please set a new password before continuing.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="theme-input"
              required
              autoComplete="current-password"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="theme-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>At least 8 characters required.</p>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="theme-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p style={{ color: "var(--error)", fontSize: 14, marginBottom: 12 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {!required && (
              <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="theme-btn theme-btn-primary"
              disabled={
                saving ||
                !currentPassword.trim() ||
                newPassword.trim().length < 8 ||
                newPassword.trim() !== confirmPassword.trim()
              }
            >
              {saving ? "Saving…" : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

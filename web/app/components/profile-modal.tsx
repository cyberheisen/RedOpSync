"use client";

import { useRef, useState } from "react";

const DEFAULT_AVATAR = "/redop.png";

type Props = {
  displayName: string;
  avatarUrl: string;
  onClose: () => void;
  onSave: (displayName: string, avatarUrl: string | null) => void;
};

export function ProfileModal({ displayName, avatarUrl, onClose, onSave }: Props) {
  const [name, setName] = useState(displayName);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentAvatar = previewUrl ?? avatarUrl;

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const urlToSave = previewUrl ?? avatarUrl;
    onSave(name.trim() || displayName, urlToSave === DEFAULT_AVATAR ? null : urlToSave);
    onClose();
  }

  function handleClose() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  }

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
      onClick={handleClose}
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
        <h2 style={{ margin: "0 0 20px", fontSize: "1.25rem" }}>Profile</h2>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="theme-input"
              placeholder="Display name"
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Avatar</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  overflow: "hidden",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <img
                  src={currentAvatar}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="theme-btn theme-btn-ghost"
                  style={{ fontSize: 13 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload image
                </button>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                  JPG, PNG or GIF. Max 2MB.
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="theme-btn theme-btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

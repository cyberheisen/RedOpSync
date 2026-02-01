"use client";

import { useRef, useState } from "react";

type Props = {
  onClose: () => void;
  onSubmit: (file: File | null) => Promise<void>;
};

export function ImportMissionModal({ onClose, onSubmit }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.toLowerCase().endsWith(".zip");
      if (ext) setSelectedFile(file);
      else setSelectedFile(null);
    } else {
      setSelectedFile(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(selectedFile);
    onClose();
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Import mission</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            style={{ marginBottom: 8 }}
          >
            Choose file (.zip)
          </button>
          {selectedFile && (
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>{selectedFile.name}</p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="theme-btn theme-btn-primary">Import</button>
          </div>
        </form>
      </div>
    </div>
  );
}

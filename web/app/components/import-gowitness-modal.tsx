"use client";

import { useRef, useState } from "react";
import { apiUrl } from "../lib/api";

type Props = {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
};

type Summary = {
  hosts_created: number;
  ports_created: number;
  screenshots_imported: number;
  metadata_records_imported: number;
  errors: string[];
  skipped?: number;
};

export function ImportGoWitnessModal({ projectId, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.toLowerCase().endsWith(".zip")) {
        setError("File must be a .zip archive");
        setFile(null);
      } else {
        setError(null);
        setFile(f);
      }
    } else {
      setFile(null);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiUrl(`/api/projects/${projectId}/gowitness-import`), {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : `Import failed (${res.status})`);
        return;
      }
      setResult(data);
      if (data.hosts_created > 0 || data.ports_created > 0 || data.screenshots_imported > 0 || data.metadata_records_imported > 0) {
        onSuccess();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => fileInputRef.current?.click();

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
          maxWidth: 440,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Import GoWitness</h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>
          Upload a ZIP of your GoWitness output directory containing PNG screenshots and optional metadata JSON.
        </p>

        {!result ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <div
              style={{
                padding: 16,
                border: "1px dashed var(--border)",
                borderRadius: 8,
                marginBottom: 16,
                textAlign: "center",
                cursor: "pointer",
              }}
              onClick={handleClick}
            >
              {file ? file.name : "Drop ZIP or click to browse"}
            </div>
            {error && (
              <p style={{ margin: "0 0 12px", color: "var(--error)", fontSize: 14 }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="theme-btn theme-btn-primary"
                onClick={handleSubmit}
                disabled={!file || loading}
              >
                {loading ? "Importing…" : "Import"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: 12,
                backgroundColor: "var(--bg-elevated)",
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              <p style={{ margin: "0 0 4px" }}>Hosts created: {result.hosts_created}</p>
              <p style={{ margin: "0 0 4px" }}>Ports created: {result.ports_created}</p>
              <p style={{ margin: "0 0 4px" }}>Screenshots imported: {result.screenshots_imported}</p>
              <p style={{ margin: "0 0 4px" }}>Metadata records: {result.metadata_records_imported}</p>
              {result.skipped !== undefined && result.skipped > 0 && (
                <p style={{ margin: "0 0 4px", color: "var(--text-muted)" }}>Skipped (duplicates): {result.skipped}</p>
              )}
              {result.errors.length > 0 && (
                <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                  {result.errors.slice(0, 3).join("; ")}
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

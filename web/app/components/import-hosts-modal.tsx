"use client";

import { useRef, useState } from "react";
import { apiUrl } from "../lib/api";

export type ImportHostsContext =
  | { type: "scope" }
  | { type: "subnet"; id: string; cidr: string; name: string | null };

type Props = {
  projectId: string;
  context: ImportHostsContext;
  onClose: () => void;
  onSuccess: () => void;
};

type ImportResult = {
  format?: "nmap" | "gowitness" | "text";
  hosts_created: number;
  hosts_updated?: number;
  ports_created: number;
  ports_updated?: number;
  evidence_created?: number;
  notes_created?: number;
  screenshots_imported?: number;
  metadata_records_imported?: number;
  errors: string[];
  skipped?: number;
};

export function ImportHostsModal({ projectId, context, onClose, onSuccess }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subtext =
    context.type === "scope"
      ? "Import Nmap, GoWitness, or plain text (one host per line) into this mission."
      : `Import into Subnet: ${context.cidr}${context.name ? ` (${context.name})` : ""}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (ext === "xml" || ext === "zip" || ext === "txt") {
        setError(null);
        setSelectedFile(f);
      } else {
        setError("Use Nmap XML (.xml), ZIP (.zip), or plain text (.txt).");
        setSelectedFile(null);
      }
    } else {
      setSelectedFile(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch(apiUrl(`/api/projects/${projectId}/import`), {
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
      const hasData =
        (data.hosts_created ?? 0) > 0 ||
        (data.hosts_updated ?? 0) > 0 ||
        (data.ports_created ?? 0) > 0 ||
        (data.ports_updated ?? 0) > 0 ||
        (data.screenshots_imported ?? 0) > 0 ||
        (data.metadata_records_imported ?? 0) > 0;
      if (hasData) onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = () => fileInputRef.current?.click();

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          maxWidth: 480,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>Import Host/Scan Results</h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted)" }}>{subtext}</p>

        {!result ? (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>
              Supports Nmap XML (-oX), GoWitness ZIP, or plain text (one host per line). Format is auto-detected.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,.zip,.txt"
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
              onClick={handleFileClick}
            >
              {selectedFile ? selectedFile.name : "Choose .xml, .zip, or .txt file"}
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
                onClick={handleImport}
                disabled={!selectedFile || loading}
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
              {result.format && (
                <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--accent)" }}>
                  Imported as {result.format}
                </p>
              )}
              <p style={{ margin: "0 0 4px" }}>Hosts created: {result.hosts_created}</p>
              {(result.hosts_updated ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Hosts updated: {result.hosts_updated}</p>
              )}
              {result.format !== "text" && (
                <>
                  <p style={{ margin: "0 0 4px" }}>Ports created: {result.ports_created}</p>
              {(result.ports_updated ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Ports updated: {result.ports_updated}</p>
              )}
              {(result.evidence_created ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Evidence created: {result.evidence_created}</p>
              )}
              {(result.notes_created ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Notes created: {result.notes_created}</p>
              )}
              </>
              )}
              {(result.screenshots_imported ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Screenshots: {result.screenshots_imported}</p>
              )}
              {(result.metadata_records_imported ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Metadata: {result.metadata_records_imported}</p>
              )}
              {(result.skipped ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px", color: "var(--text-muted)" }}>
                  Skipped (duplicates): {result.skipped}
                </p>
              )}
              {result.errors.length > 0 && (
                <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                  {result.errors.slice(0, 5).join("; ")}
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={handleReset}>
                Import another
              </button>
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

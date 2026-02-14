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
  format?: "nmap" | "gowitness" | "text" | "whois";
  hosts_created: number;
  hosts_updated?: number;
  subnets_updated?: number;
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
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subtext =
    context.type === "scope"
      ? "Import scan results into this mission."
      : `Import into Subnet: ${context.cidr}${context.name ? ` (${context.name})` : ""}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setError(null);
      setSelectedFile(f);
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
        (data.subnets_updated ?? 0) > 0 ||
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
        <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>Import scan results</h2>
        <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--text-muted)" }}>{subtext}</p>
        <p style={{ margin: "0 0 20px", fontSize: 13 }}>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ padding: 0, minHeight: 0, textDecoration: "underline", color: "var(--accent)" }}
            onClick={() => setShowHelp(true)}
          >
            Supported tools and how to import
          </button>
        </p>

        {!result ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,.zip,.txt,.json"
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
              {selectedFile ? selectedFile.name : "Choose file"}
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
              {(result.subnets_updated ?? 0) > 0 && (
                <p style={{ margin: "0 0 4px" }}>Subnets updated: {result.subnets_updated}</p>
              )}
              {result.format !== "text" && result.format !== "whois" && (
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

      {showHelp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              padding: 24,
              maxWidth: 480,
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Supported tools and how to import</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
              <li style={{ marginBottom: 10 }}>
                <strong>Nmap</strong>: Nmap XML file (e.g. <code style={{ fontSize: 12 }}>-oX</code> output).
              </li>
              <li style={{ marginBottom: 10 }}>
                <strong>GoWitness</strong>: Results JSON file and all screenshots in a single ZIP.
              </li>
              <li style={{ marginBottom: 10 }}>
                <strong>Plain text</strong>: One host per line (optional hostname).
              </li>
              <li style={{ marginBottom: 10 }}>
                <strong>Whois/RDAP</strong>: JSON array of objects. Required: <code style={{ fontSize: 12 }}>ip</code> (string, host IP). Optional fields (stored in whois_data): <code style={{ fontSize: 12 }}>asn</code>, <code style={{ fontSize: 12 }}>asn_description</code>, <code style={{ fontSize: 12 }}>asn_country</code>, <code style={{ fontSize: 12 }}>country</code>, <code style={{ fontSize: 12 }}>network_name</code>, <code style={{ fontSize: 12 }}>cidr</code>, <code style={{ fontSize: 12 }}>network_type</code>, <code style={{ fontSize: 12 }}>asn_registry</code>. Sample:
                <pre style={{ margin: "8px 0 0", padding: 10, background: "var(--bg-elevated)", borderRadius: 6, fontSize: 11, overflow: "auto" }}>{`[
  { "ip": "203.0.113.10", "asn": "64496", "asn_description": "Example Org", "country": "US" },
  { "ip": "198.51.100.1", "network_name": "Example Network" }
]`}</pre>
              </li>
            </ul>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-primary" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

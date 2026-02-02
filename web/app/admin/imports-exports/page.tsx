"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";
import { Toast } from "../../components/toast";

type ImportExportRecord = {
  id: string;
  type: "import" | "export";
  project_name: string;
  status: "completed" | "in_progress" | "failed" | "pending";
  created_at: string;
  file_name: string;
  user: string;
};

export default function AdminImportsExportsPage() {
  const [records, setRecords] = useState<ImportExportRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [bulkExportModal, setBulkExportModal] = useState(false);
  const [bulkImportModal, setBulkImportModal] = useState(false);
  const [validateModal, setValidateModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "import" | "export">("all");
  const [loading, setLoading] = useState(true);
  const [validateFile, setValidateFile] = useState<File | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/admin/import-export"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadJobs = () => {
    fetch(apiUrl("/api/admin/import-export"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRecords(Array.isArray(data) ? data : []));
  };

  const filteredRecords = filter === "all" ? records : records.filter((r) => r.type === filter);

  const handleBulkExport = async () => {
    const res = await fetch(apiUrl("/api/admin/import-export/export"), {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(data.detail ?? "Export failed");
      return;
    }
    setBulkExportModal(false);
    loadJobs();
    setToast("Export started");
  };

  const handleBulkImport = async () => {
    if (!importFile) {
      setToast("Select a file first");
      return;
    }
    const fd = new FormData();
    fd.append("file", importFile);
    const res = await fetch(apiUrl("/api/admin/import-export/import"), {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(data.detail ?? "Import failed");
      return;
    }
    setBulkImportModal(false);
    setImportFile(null);
    loadJobs();
    setToast("Import started");
  };

  const handleValidate = async () => {
    if (!validateFile) {
      setToast("Select a file first");
      return;
    }
    const fd = new FormData();
    fd.append("file", validateFile);
    const res = await fetch(apiUrl("/api/admin/import-export/validate"), {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    setValidateModal(false);
    setValidateFile(null);
    setToast(data.valid ? "Archive is valid" : `Invalid: ${data.error ?? "Unknown error"}`);
  };

  const formatTimeAgo = (isoDate: string) => {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    completed: { bg: "rgba(72, 187, 120, 0.1)", color: "#48bb78", border: "rgba(72, 187, 120, 0.3)" },
    in_progress: { bg: "rgba(236, 201, 75, 0.1)", color: "#ecc94b", border: "rgba(236, 201, 75, 0.3)" },
    pending: { bg: "rgba(160, 174, 192, 0.1)", color: "#a0aec0", border: "rgba(160, 174, 192, 0.3)" },
    failed: { bg: "var(--error-bg)", color: "var(--error)", border: "var(--accent-dim)" },
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Imports / Exports</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>
            Manage bulk data operations
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            onClick={() => setValidateModal(true)}
          >
            Validate Import
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            onClick={() => setBulkImportModal(true)}
          >
            Bulk Import
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-primary"
            onClick={() => setBulkExportModal(true)}
          >
            Bulk Export
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "import", "export"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`theme-btn ${filter === f ? "theme-btn-primary" : "theme-btn-ghost"}`}
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}s
          </button>
        ))}
      </div>

      <div
        style={{
          backgroundColor: "var(--bg-panel)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Type</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Project</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>File</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>User</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                  No records found
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        textTransform: "uppercase",
                        backgroundColor: record.type === "export" ? "rgba(66, 153, 225, 0.1)" : "rgba(159, 122, 234, 0.1)",
                        color: record.type === "export" ? "#4299e1" : "#9f7aea",
                        border: `1px solid ${record.type === "export" ? "rgba(66, 153, 225, 0.3)" : "rgba(159, 122, 234, 0.3)"}`,
                      }}
                    >
                      {record.type}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{record.project_name}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                    {record.file_name}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{record.user}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        backgroundColor: (statusColors[record.status] ?? statusColors.pending).bg,
                        color: (statusColors[record.status] ?? statusColors.pending).color,
                        border: `1px solid ${(statusColors[record.status] ?? statusColors.pending).border}`,
                      }}
                    >
                      {record.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{formatTimeAgo(record.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Export Modal */}
      {bulkExportModal && (
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
          onClick={() => setBulkExportModal(false)}
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
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Bulk Export</h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
              Export all projects as a single archive. This may take several minutes for large datasets.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setBulkExportModal(false)}>
                Cancel
              </button>
              <button type="button" className="theme-btn theme-btn-primary" onClick={handleBulkExport}>
                Start Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {bulkImportModal && (
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
          onClick={() => setBulkImportModal(false)}
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
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Bulk Import</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Import projects from an archive file (.zip).
            </p>
            <label
              style={{
                display: "block",
                padding: 24,
                border: "2px dashed var(--border)",
                borderRadius: 8,
                textAlign: "center",
                color: "var(--text-muted)",
                marginBottom: 16,
                cursor: "pointer",
              }}
            >
              <input
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              {importFile ? importFile.name : "Drop file here or click to browse"}
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => { setBulkImportModal(false); setImportFile(null); }}>
                Cancel
              </button>
              <button type="button" className="theme-btn theme-btn-primary" onClick={handleBulkImport}>
                Start Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validate Import Modal */}
      {validateModal && (
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
          onClick={() => setValidateModal(false)}
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
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Validate Import</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Validate an import archive without actually importing data.
            </p>
            <label
              style={{
                display: "block",
                padding: 24,
                border: "2px dashed var(--border)",
                borderRadius: 8,
                textAlign: "center",
                color: "var(--text-muted)",
                marginBottom: 16,
                cursor: "pointer",
              }}
            >
              <input
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={(e) => setValidateFile(e.target.files?.[0] ?? null)}
              />
              {validateFile ? validateFile.name : "Drop file here or click to browse"}
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => { setValidateModal(false); setValidateFile(null); }}>
                Cancel
              </button>
              <button type="button" className="theme-btn theme-btn-primary" onClick={handleValidate} disabled={!validateFile}>
                Validate
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

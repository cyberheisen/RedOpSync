"use client";

import { useState, useRef } from "react";

export type ImportHostsContext =
  | { type: "scope" }
  | { type: "subnet"; id: string; cidr: string; name: string | null }
  | { type: "host"; hostId: string; ip: string };

type Props = {
  context: ImportHostsContext;
  onClose: () => void;
  onSuccess: () => void;
};

const PASTE_PLACEHOLDER = `10.0.0.1
10.0.0.2,10.0.0.3
192.168.1.0/24
app.example.com`;

export function ImportHostsModal({ context, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<"paste" | "file">("paste");
  const [pasteInput, setPasteInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [mockHosts, setMockHosts] = useState(0);
  const [mockSubnets, setMockSubnets] = useState(0);
  const [mockDuplicates, setMockDuplicates] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subtext =
    context.type === "scope"
      ? "Importing into Scope"
      : context.type === "subnet"
        ? `Importing into Subnet: ${context.cidr}${context.name ? ` (${context.name})` : ""}`
        : `Importing for host ${context.ip}`;

  const getInputSize = () => {
    if (activeTab === "paste") {
      const lines = pasteInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return lines.length;
    }
    return selectedFile ? 1 : 0;
  };

  const handlePreview = () => {
    const size = getInputSize();
    setMockHosts(Math.max(0, size * 3 + 2));
    setMockSubnets(Math.max(0, Math.floor(size / 2)));
    setMockDuplicates(Math.max(0, size - 1));
    setShowPreview(true);
  };

  const handleImport = () => {
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      onSuccess();
      onClose();
    }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "txt" || ext === "csv") {
        setSelectedFile(file);
      }
    } else {
      setSelectedFile(null);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
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
          <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>Import hosts</h2>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted)" }}>{subtext}</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className="theme-btn"
              style={{
                ...(activeTab === "paste"
                  ? { backgroundColor: "var(--accent-bg)", borderColor: "var(--accent)", color: "var(--accent)" }
                  : {}),
              }}
              onClick={() => setActiveTab("paste")}
            >
              Paste
            </button>
            <button
              type="button"
              className="theme-btn"
              style={{
                ...(activeTab === "file"
                  ? { backgroundColor: "var(--accent-bg)", borderColor: "var(--accent)", color: "var(--accent)" }
                  : {}),
              }}
              onClick={() => setActiveTab("file")}
            >
              File upload
            </button>
          </div>

          {activeTab === "paste" ? (
            <textarea
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder={PASTE_PLACEHOLDER}
              className="theme-input"
              rows={8}
              style={{ resize: "vertical", marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}
            />
          ) : (
            <div style={{ marginBottom: 16 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <button type="button" className="theme-btn theme-btn-ghost" onClick={handleFileClick} style={{ marginBottom: 8 }}>
                Choose file (.txt, .csv)
              </button>
              {selectedFile && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>{selectedFile.name}</p>
              )}
            </div>
          )}

          {showPreview && (
            <div
              style={{
                padding: 12,
                backgroundColor: "var(--bg-elevated)",
                borderRadius: 6,
                border: "1px solid var(--border)",
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              <p style={{ margin: "0 0 4px" }}>{mockHosts} hosts detected</p>
              <p style={{ margin: "0 0 4px" }}>{mockSubnets} subnets detected</p>
              <p style={{ margin: 0 }}>{mockDuplicates} duplicates skipped</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="theme-btn" onClick={handlePreview}>
              Preview
            </button>
            <button type="button" className="theme-btn theme-btn-primary" onClick={handleImport}>
              Import
            </button>
          </div>
        </div>
      </div>

      {showToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--bg-panel)",
            border: "1px solid var(--accent)",
            borderRadius: 8,
            padding: "12px 20px",
            color: "var(--text)",
            fontSize: 14,
            zIndex: 1001,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          Import complete (mock)
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { apiUrl } from "../lib/api";
import { PortAttachmentsSection } from "./port-attachments-section";
import { PendingAttachmentsSection, type PendingAttachmentsHandle } from "./pending-attachments-section";

const STATE_OPTIONS = ["open", "closed", "filtered", "unknown"] as const;
const PROTOCOL_OPTIONS = ["tcp", "udp"] as const;

type Props = {
  hostId: string;
  hostIp: string;
  mode: "add" | "edit";
  existingPorts?: { number: number; protocol: string }[];
  port?: {
    id: string;
    number: number;
    protocol: string;
    state: string | null;
    service_name: string | null;
    description_md: string | null;
    evidence_md: string | null;
    discovered_by: string | null;
    created_at?: string;
    updated_at?: string;
  };
  canEdit?: boolean;
  onClose: () => void;
  onSubmit: (data: {
    number: number;
    protocol: "tcp" | "udp";
    state: string;
    service_name: string | null;
    description_md: string | null;
    evidence_md: string | null;
  }) => Promise<{ id: string } | void>;
  onRefresh?: () => void;
};

export function PortModal({
  hostId,
  hostIp,
  mode,
  existingPorts = [],
  port,
  canEdit = true,
  onClose,
  onSubmit,
  onRefresh,
}: Props) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [modalRef, setModalRef] = useState<HTMLDivElement | null>(null);
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const pendingAttachmentsRef = useRef<PendingAttachmentsHandle>(null);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          if (mode === "edit" && port && canEdit) {
            const fd = new FormData();
            fd.append("file", file);
            fetch(apiUrl(`/api/ports/${port.id}/attachments/paste`), { method: "POST", credentials: "include", body: fd })
              .then((r) => r.ok && setAttachmentsRefreshKey((k) => k + 1))
              .then(() => onRefresh?.());
          } else if (mode === "add") {
            pendingAttachmentsRef.current?.addFile(file, true);
          }
          return;
        }
      }
    },
    [mode, port, canEdit, onRefresh]
  );

  useEffect(() => {
    const el = modalRef;
    if (!el) return;
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, [modalRef, handlePaste]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);
    const form = e.currentTarget;
    const number = parseInt((form.elements.namedItem("number") as HTMLInputElement).value.trim(), 10);
    const protocol = (form.elements.namedItem("protocol") as HTMLSelectElement).value as "tcp" | "udp";
    const state = (form.elements.namedItem("state") as HTMLSelectElement).value;
    const serviceName = (form.elements.namedItem("service_name") as HTMLInputElement).value.trim() || null;
    const descriptionMd = (form.elements.namedItem("description_md") as HTMLTextAreaElement).value.trim() || null;
    const evidenceMd = (form.elements.namedItem("evidence_md") as HTMLTextAreaElement).value.trim() || null;

    if (Number.isNaN(number) || number < 1 || number > 65535) {
      setValidationError("Port number must be between 1 and 65535.");
      return;
    }

    if (mode === "add" && existingPorts.some((p) => p.number === number && p.protocol === protocol)) {
      setValidationError("A port with this number and protocol already exists on this host.");
      return;
    }

    const result = await onSubmit({
      number,
      protocol,
      state: state || "unknown",
      service_name: serviceName,
      description_md: descriptionMd,
      evidence_md: evidenceMd,
    });
    if (mode === "add" && result && "id" in result && pendingAttachments.length > 0) {
      for (const file of pendingAttachments) {
        const fd = new FormData();
        fd.append("file", file);
        await fetch(apiUrl(`/api/ports/${result.id}/attachments`), {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      }
    }
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
        ref={setModalRef}
        tabIndex={-1}
        style={{
          backgroundColor: "var(--bg-panel)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          padding: 24,
          maxWidth: 560,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>
          {mode === "add" ? "Add Port" : "Edit Port"}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>
          Host: {hostIp}
        </p>
        <form onSubmit={handleSubmit}>
          {validationError && (
            <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              {validationError}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Port number (1–65535)</label>
              <input
                name="number"
                type="number"
                min={1}
                max={65535}
                required
                defaultValue={port?.number}
                disabled={mode === "edit"}
                className="theme-input"
                style={mode === "edit" ? { opacity: 0.8 } : undefined}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Protocol</label>
              <select
                name="protocol"
                required
                defaultValue={port?.protocol ?? "tcp"}
                disabled={mode === "edit"}
                className="theme-input"
                style={mode === "edit" ? { opacity: 0.8 } : undefined}
              >
                {PROTOCOL_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>State</label>
            <select
              name="state"
              defaultValue={port?.state ?? "unknown"}
              className="theme-input"
            >
              {STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Service name (optional)</label>
            <input
              name="service_name"
              type="text"
              placeholder="e.g. ssh, http"
              defaultValue={port?.service_name ?? ""}
              className="theme-input"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Description (markdown)</label>
            <textarea
              name="description_md"
              rows={3}
              placeholder="Port description..."
              defaultValue={port?.description_md ?? ""}
              className="theme-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Evidence / Notes (markdown)</label>
            <textarea
              name="evidence_md"
              rows={4}
              placeholder="Evidence and notes about this port..."
              defaultValue={port?.evidence_md ?? ""}
              className="theme-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          {mode === "add" && (
            <div style={{ marginBottom: 16 }}>
              <PendingAttachmentsSection ref={pendingAttachmentsRef} onChange={setPendingAttachments} />
            </div>
          )}
          {mode === "edit" && port && (
            <div style={{ marginBottom: 16 }}>
              <PortAttachmentsSection key={attachmentsRefreshKey} portId={port.id} canEdit={canEdit} onRefresh={() => { setAttachmentsRefreshKey((k) => k + 1); onRefresh?.(); }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
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

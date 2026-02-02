"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "../lib/api";

type Host = { id: string; ip: string; dns_name: string | null; subnet_id: string | null };
type Subnet = { id: string; cidr: string; name: string | null };

type Props = {
  vulnDefId: string;
  projectId: string;
  currentHostIds: string[];
  affectedSubnetIds: string[];
  hosts: Host[];
  subnets: Subnet[];
  onClose: () => void;
  onSuccess: () => void;
};

export function ManageAffectedHostsModal({
  vulnDefId,
  projectId,
  currentHostIds,
  affectedSubnetIds,
  hosts,
  subnets,
  onClose,
  onSuccess,
}: Props) {
  const [selectedHostIds, setSelectedHostIds] = useState<Set<string>>(new Set(currentHostIds));
  const [selectedSubnetIds, setSelectedSubnetIds] = useState<Set<string>>(new Set(affectedSubnetIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostsBySubnet = hosts.reduce<Record<string, Host[]>>((acc, h) => {
    const k = h.subnet_id ?? "_unassigned";
    if (!acc[k]) acc[k] = [];
    acc[k].push(h);
    return acc;
  }, {});

  const effectiveHostIds = new Set(selectedHostIds);
  for (const sid of selectedSubnetIds) {
    for (const h of hostsBySubnet[sid] ?? []) {
      effectiveHostIds.add(h.id);
    }
  }

  const toggleHost = (id: string) => {
    setSelectedHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubnet = (id: string) => {
    setSelectedSubnetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const hostRes = await fetch(apiUrl(`/api/vulnerability-definitions/${vulnDefId}/affected-hosts`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ host_ids: Array.from(selectedHostIds) }),
      });
      if (!hostRes.ok) throw new Error(await hostRes.text());
      const subnetRes = await fetch(apiUrl(`/api/vulnerability-definitions/${vulnDefId}/affected-subnets`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subnet_ids: Array.from(selectedSubnetIds) }),
      });
      if (!subnetRes.ok) throw new Error(await subnetRes.text());
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
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
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Manage Affected Hosts</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Select hosts directly or apply to entire subnets. Subnet associations inherit to all hosts in that subnet (including hosts added later).
        </p>
        {error && (
          <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Apply to subnets</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {subnets.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectedSubnetIds.has(s.id)}
                  onChange={() => toggleSubnet(s.id)}
                />
                <span>{s.cidr}{s.name ? ` (${s.name})` : ""}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Direct host associations</h3>
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
            {hosts.map((h) => (
              <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={selectedHostIds.has(h.id)}
                  onChange={() => toggleHost(h.id)}
                />
                <span>{h.ip}{h.dns_name ? ` (${h.dns_name})` : ""}</span>
              </label>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Total affected hosts: {effectiveHostIds.size} (direct + subnet-inherited)
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="theme-btn theme-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

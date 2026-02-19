"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";
import { Toast } from "../../components/toast";

type Mission = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
};

export default function AdminMissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<"single" | "bulk" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Mission | null>(null);

  useEffect(() => {
    loadMissions();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMissions = async () => {
    try {
      const res = await fetch(apiUrl("/api/projects"), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMissions(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const filteredMissions = missions.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMissions.map((p) => p.id)));
    }
  };

  const handleDeleteSingle = async (mission: Mission) => {
    try {
      const res = await fetch(apiUrl(`/api/projects/${mission.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
      if (res.ok) {
        setMissions((prev) => prev.filter((p) => p.id !== mission.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(mission.id);
          return next;
        });
        setToast(`Mission "${mission.name}" deleted`);
      } else {
        const msg = Array.isArray(data.detail) ? (data.detail as { msg?: string }[]).map((d) => d.msg || "").join("; ") : typeof data.detail === "string" ? data.detail : "Delete failed";
        setToast(msg || `Delete failed (${res.status})`);
      }
    } catch (e) {
      setToast("Delete failed");
    }
    setDeleteModal(null);
    setDeleteTarget(null);
  };

  const handleExportMission = async (mission: Mission) => {
    try {
      const url = apiUrl(`/api/admin/import-export/export?project_id=${encodeURIComponent(mission.id)}`);
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast("Export started. Go to Imports / Exports to download when ready.");
      } else {
        setToast(data.detail ?? "Export failed");
      }
    } catch {
      setToast("Export failed");
    }
  };

  const handleDeleteBulk = async () => {
    const toDelete = Array.from(selectedIds);
    const failed: string[] = [];
    for (const id of toDelete) {
      try {
        const res = await fetch(apiUrl(`/api/projects/${id}`), {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) failed.push(id);
      } catch {
        failed.push(id);
      }
    }
    const deleted = toDelete.length - failed.length;
    if (deleted > 0) {
      setMissions((prev) => prev.filter((p) => !selectedIds.has(p.id) || failed.includes(p.id)));
      setSelectedIds(new Set());
    }
    setDeleteModal(null);
    setToast(failed.length > 0 ? `Deleted ${deleted}, failed ${failed.length}` : `Deleted ${deleted} mission(s)`);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, color: "var(--text-muted)" }}>Loading missions…</div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Missions</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>
            Manage all missions in the system
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="theme-btn"
              style={{ backgroundColor: "var(--error)", borderColor: "var(--error)", color: "#fff" }}
              onClick={() => setDeleteModal("bulk")}
            >
              Delete {selectedIds.size} Selected
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search missions…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="theme-input"
          style={{ maxWidth: 300 }}
        />
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
              <th style={{ padding: "12px 16px", textAlign: "left", width: 40 }}>
                <input type="checkbox" checked={selectedIds.size === filteredMissions.length && filteredMissions.length > 0} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Name</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Description</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Created</th>
              <th style={{ padding: "12px 16px", textAlign: "right", color: "var(--text-muted)", fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMissions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                  No missions found
                </td>
              </tr>
            ) : (
              filteredMissions.map((mission) => (
                <tr key={mission.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <input type="checkbox" checked={selectedIds.has(mission.id)} onChange={() => toggleSelect(mission.id)} style={{ cursor: "pointer" }} />
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{mission.name}</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{mission.description || "—"}</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{new Date(mission.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 12, marginRight: 8 }}
                      onClick={() => handleExportMission(mission)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 12, color: "var(--error)" }}
                      onClick={() => { setDeleteTarget(mission); setDeleteModal("single"); }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteModal === "single" && deleteTarget && (
        <DeleteMissionModal
          mission={deleteTarget}
          onClose={() => { setDeleteModal(null); setDeleteTarget(null); }}
          onConfirm={() => handleDeleteSingle(deleteTarget)}
        />
      )}

      {deleteModal === "bulk" && (
        <BulkDeleteModal count={selectedIds.size} onClose={() => setDeleteModal(null)} onConfirm={handleDeleteBulk} />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function DeleteMissionModal({ mission, onClose, onConfirm }: { mission: Mission; onClose: () => void; onConfirm: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === mission.name;

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete mission</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>Type <strong>{mission.name}</strong> to confirm deletion. This will permanently delete all associated data.</p>
        <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={mission.name} className="theme-input" style={{ marginBottom: 16, borderColor: matches ? "var(--accent)" : undefined }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="theme-btn theme-btn-primary" disabled={!matches} onClick={onConfirm} style={matches ? { backgroundColor: "var(--error)", borderColor: "var(--error)" } : undefined}>Delete mission</button>
        </div>
      </div>
    </div>
  );
}

function BulkDeleteModal({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === "DELETE";

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete {count} missions</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>Type <strong>DELETE</strong> to confirm bulk deletion. This action cannot be undone.</p>
        <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="theme-input" style={{ marginBottom: 16, borderColor: matches ? "var(--accent)" : undefined }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="theme-btn theme-btn-primary" disabled={!matches} onClick={onConfirm} style={matches ? { backgroundColor: "var(--error)", borderColor: "var(--error)" } : undefined}>Delete All</button>
        </div>
      </div>
    </div>
  );
}

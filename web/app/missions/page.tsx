"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "../lib/api";
import { AddMissionModal } from "../components/add-mission-modal";
import { ContextMenu } from "../components/context-menu";
import { DeleteMissionModal } from "../components/delete-mission-modal";
import { ImportMissionModal } from "../components/import-mission-modal";
import { RenameMissionModal } from "../components/rename-mission-modal";
import { SetDatesModal } from "../components/set-dates-modal";
import { Toast } from "../components/toast";

type Mission = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

function missionStatus(start: string | null, end: string | null): "active" | "completed" | "upcoming" {
  const now = new Date();
  if (start) {
    const startD = new Date(start);
    if (now < startD) return "upcoming";
  }
  if (end) {
    const endD = new Date(end);
    if (now > endD) return "completed";
  }
  return "active";
}

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: { label: string; onClick: () => void }[] } | null>(null);
  const [addMissionModal, setAddMissionModal] = useState(false);
  const [importMissionModal, setImportMissionModal] = useState(false);
  const [renameMissionModal, setRenameMissionModal] = useState<Mission | null>(null);
  const [setDatesModal, setSetDatesModal] = useState<Mission | null>(null);
  const [deleteMissionModal, setDeleteMissionModal] = useState<Mission | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadMissions = useCallback(() => {
    fetch(apiUrl("/api/projects"), { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load missions");
        return r.json();
      })
      .then(setMissions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreate = async (name: string, description: string) => {
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch(apiUrl("/api/projects"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          countdown_red_days_default: 7,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create mission");
      }
      setAddMissionModal(false);
      loadMissions();
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (missionId: string, name: string) => {
    try {
      const res = await fetch(apiUrl(`/api/projects/${missionId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      setRenameMissionModal(null);
      loadMissions();
    } catch {
      setToast("Rename failed (stub)");
    }
  };

  const handleSetDates = async (missionId: string, startDate: string, endDate: string) => {
    try {
      const res = await fetch(apiUrl(`/api/projects/${missionId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to set dates");
      setSetDatesModal(null);
      loadMissions();
    } catch {
      setToast("Set dates failed (stub)");
    }
  };

  const handleDelete = async (missionId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/projects/${missionId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setDeleteMissionModal(null);
      loadMissions();
    } catch {
      setToast("Delete failed (stub)");
    }
  };

  const handleExport = (mission: Mission) => {
    const blob = new Blob([`Mock export for ${mission.name}`], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mission.name.replace(/\s+/g, "-")}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Export complete (mock)");
  };

  const handleImport = async () => {
    setToast("Import complete (mock)");
    setImportMissionModal(false);
    loadMissions();
  };

  if (loading) return <main style={{ padding: 24, color: "var(--text)" }}>Loading missions…</main>;
  if (error)
    return (
      <main style={{ padding: 24, color: "var(--error)" }}>
        Error: {error}
      </main>
    );

  return (
    <main style={{ padding: 24, color: "var(--text)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Missions</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setAddMissionModal(true)} className="theme-btn theme-btn-primary">
            + New mission
          </button>
          <button type="button" onClick={() => setImportMissionModal(true)} className="theme-btn theme-btn-ghost">
            Import mission
          </button>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {missions.map((p) => {
          const status = missionStatus(p.start_date, p.end_date);
          return (
            <div
              key={p.id}
              style={{
                padding: 20,
                backgroundColor: "var(--bg-panel)",
                borderRadius: 8,
                border: "1px solid var(--border)",
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
              }}
              onClick={() => router.push(`/missions/${p.id}`)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: "Open mission", onClick: () => router.push(`/missions/${p.id}`) },
                    { label: "Rename", onClick: () => setRenameMissionModal(p) },
                    { label: "Set dates (start / end)", onClick: () => setSetDatesModal(p) },
                    { label: "Export mission", onClick: () => handleExport(p) },
                    { label: "Delete", onClick: () => setDeleteMissionModal(p) },
                  ],
                });
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--tree-hover)";
                e.currentTarget.style.borderColor = "var(--accent-dim)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-panel)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "1.0625rem" }}>{p.name}</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    textTransform: "capitalize",
                  }}
                >
                  {status}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                <div>Start: {formatDate(p.start_date)}</div>
                <div>End: {formatDate(p.end_date)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {missions.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No missions yet. Right-click or use &quot;+ New mission&quot; to create one.</p>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
      )}

      {addMissionModal && (
        <AddMissionModal
          error={createError}
          onClose={() => { setAddMissionModal(false); setCreateError(""); }}
          onSubmit={handleCreate}
        />
      )}

      {importMissionModal && (
        <ImportMissionModal onClose={() => setImportMissionModal(false)} onSubmit={handleImport} />
      )}

      {renameMissionModal && (
        <RenameMissionModal
          missionName={renameMissionModal.name}
          onClose={() => setRenameMissionModal(null)}
          onSubmit={(name) => handleRename(renameMissionModal.id, name)}
        />
      )}

      {setDatesModal && (
        <SetDatesModal
          missionName={setDatesModal.name}
          startDate={setDatesModal.start_date ? setDatesModal.start_date.slice(0, 10) : ""}
          endDate={setDatesModal.end_date ? setDatesModal.end_date.slice(0, 10) : ""}
          onClose={() => setSetDatesModal(null)}
          onSubmit={(start, end) => handleSetDates(setDatesModal.id, start, end)}
        />
      )}

      {deleteMissionModal && (
        <DeleteMissionModal
          missionName={deleteMissionModal.name}
          onClose={() => setDeleteMissionModal(null)}
          onConfirm={() => handleDelete(deleteMissionModal.id)}
        />
      )}

      {toast && <Toast message={toast} />}
    </main>
  );
}

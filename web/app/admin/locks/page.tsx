"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";
import { Toast } from "../../components/toast";

type Lock = {
  id: string;
  project_id: string;
  project_name?: string;
  record_type: string;
  record_id: string;
  locked_by_user_id: string;
  locked_by_username: string | null;
  locked_at: string;
  expires_at: string;
};

// Mock data for locks (would come from API in production)
const mockLocks: Lock[] = [
  {
    id: "lock-1",
    project_id: "proj-1",
    project_name: "Acme Corp Engagement",
    record_type: "host",
    record_id: "host-123",
    locked_by_user_id: "user-1",
    locked_by_username: "jsmith",
    locked_at: new Date(Date.now() - 1800000).toISOString(),
    expires_at: new Date(Date.now() + 300000).toISOString(),
  },
  {
    id: "lock-2",
    project_id: "proj-1",
    project_name: "Acme Corp Engagement",
    record_type: "subnet",
    record_id: "subnet-456",
    locked_by_user_id: "user-2",
    locked_by_username: "admin",
    locked_at: new Date(Date.now() - 600000).toISOString(),
    expires_at: new Date(Date.now() + 1200000).toISOString(),
  },
  {
    id: "lock-3",
    project_id: "proj-2",
    project_name: "Beta Test Project",
    record_type: "port",
    record_id: "port-789",
    locked_by_user_id: "user-1",
    locked_by_username: "jsmith",
    locked_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 600000).toISOString(),
  },
];

export default function AdminLocksPage() {
  const [locks, setLocks] = useState<Lock[]>(mockLocks);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [releaseModal, setReleaseModal] = useState<Lock | null>(null);
  const [releaseAllModal, setReleaseAllModal] = useState<string | null>(null); // project_id

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleForceRelease = (lock: Lock) => {
    setLocks((prev) => prev.filter((l) => l.id !== lock.id));
    setReleaseModal(null);
    setToast(`Lock released for ${lock.record_type}:${lock.record_id.slice(0, 8)}`);
  };

  const handleReleaseAllForProject = (projectId: string) => {
    const projectName = locks.find((l) => l.project_id === projectId)?.project_name ?? "project";
    setLocks((prev) => prev.filter((l) => l.project_id !== projectId));
    setReleaseAllModal(null);
    setToast(`All locks released for "${projectName}"`);
  };

  const groupedByProject = locks.reduce((acc, lock) => {
    const key = lock.project_id;
    if (!acc[key]) acc[key] = { name: lock.project_name ?? "Unknown Project", locks: [] };
    acc[key].locks.push(lock);
    return acc;
  }, {} as Record<string, { name: string; locks: Lock[] }>);

  const formatTimeAgo = (isoDate: string) => {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const formatExpiry = (isoDate: string) => {
    const diff = new Date(isoDate).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `in ${hrs}h ${mins % 60}m`;
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Active Locks</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>
          View and force-release record locks across all projects
        </p>
      </div>

      {locks.length === 0 ? (
        <div
          style={{
            padding: 32,
            backgroundColor: "var(--bg-panel)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          No active locks
        </div>
      ) : (
        Object.entries(groupedByProject).map(([projectId, { name, locks: projectLocks }]) => (
          <div
            key={projectId}
            style={{
              marginBottom: 24,
              backgroundColor: "var(--bg-panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                backgroundColor: "var(--bg-elevated)",
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 13 }}>
                  ({projectLocks.length} lock{projectLocks.length !== 1 ? "s" : ""})
                </span>
              </div>
              <button
                type="button"
                className="theme-btn theme-btn-ghost"
                style={{ padding: "4px 10px", fontSize: 12, color: "var(--error)" }}
                onClick={() => setReleaseAllModal(projectId)}
              >
                Release All
              </button>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Record</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>User</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Locked</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Expires</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", color: "var(--text-muted)", fontWeight: 500 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projectLocks.map((lock) => (
                  <tr key={lock.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          backgroundColor: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          marginRight: 8,
                        }}
                      >
                        {lock.record_type}
                      </span>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                        {lock.record_id.slice(0, 12)}…
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>{lock.locked_by_username ?? "Unknown"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{formatTimeAgo(lock.locked_at)}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{formatExpiry(lock.expires_at)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        type="button"
                        className="theme-btn theme-btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12, color: "var(--error)" }}
                        onClick={() => setReleaseModal(lock)}
                      >
                        Force Release
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Release Single Lock Modal */}
      {releaseModal && (
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
          onClick={() => setReleaseModal(null)}
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
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Force Release Lock</h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
              Release lock on <strong>{releaseModal.record_type}</strong> held by{" "}
              <strong>{releaseModal.locked_by_username ?? "unknown user"}</strong>?
              <br /><br />
              This may cause the user to lose unsaved changes.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setReleaseModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="theme-btn theme-btn-primary"
                style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }}
                onClick={() => handleForceRelease(releaseModal)}
              >
                Force Release
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release All For Project Modal */}
      {releaseAllModal && (
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
          onClick={() => setReleaseAllModal(null)}
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
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Release All Locks</h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
              Release all locks for{" "}
              <strong>{groupedByProject[releaseAllModal]?.name ?? "this project"}</strong>?
              <br /><br />
              This may cause multiple users to lose unsaved changes.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setReleaseAllModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="theme-btn theme-btn-primary"
                style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }}
                onClick={() => handleReleaseAllForProject(releaseAllModal)}
              >
                Release All
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

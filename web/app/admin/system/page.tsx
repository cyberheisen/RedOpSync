"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";
import { Toast } from "../../components/toast";

type Session = {
  id: string;
  user: string;
  ip: string;
  last_activity: string;
  created_at: string;
};

export default function AdminSystemPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText: string;
    action: () => void;
  } | null>(null);
  const [stats, setStats] = useState<{ database_size_mb: number; total_records: number; uptime: string; api_requests_24h: number } | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCurrentUsername(d.username));
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/admin/system/sessions"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setSessions);
    fetch(apiUrl("/api/admin/system/stats"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats);
  }, [confirmModal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = () => {
    fetch(apiUrl("/api/admin/system/sessions"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setSessions);
    fetch(apiUrl("/api/admin/system/stats"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats);
  };

  const formatTimeAgo = (isoDate: string) => {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  const handleCleanupOrphans = () => {
    setConfirmModal({
      title: "Cleanup Orphaned Records",
      message: "This will scan the database and remove orphaned records (hosts without projects, ports without hosts, etc.). This operation may take several minutes.",
      confirmText: "Run Cleanup",
      action: async () => {
        const res = await fetch(apiUrl("/api/admin/system/cleanup-orphans"), { method: "POST", credentials: "include" });
        setConfirmModal(null);
        if (res.ok) {
          reload();
          setToast("Orphan cleanup completed");
        } else {
          setToast("Cleanup failed");
        }
      },
    });
  };

  const handleVacuumDB = () => {
    setConfirmModal({
      title: "Vacuum / Optimize Database",
      message: "This will run database maintenance to reclaim storage and optimize performance. The database may be temporarily slow during this operation.",
      confirmText: "Run Vacuum",
      action: async () => {
        const res = await fetch(apiUrl("/api/admin/system/vacuum"), { method: "POST", credentials: "include" });
        setConfirmModal(null);
        if (res.ok) {
          reload();
          setToast("Database vacuum completed");
        } else {
          const d = await res.json().catch(() => ({}));
          setToast(d.detail ?? "Vacuum failed");
        }
      },
    });
  };

  const handleForceLogoutAll = () => {
    setConfirmModal({
      title: "Force Logout All Users",
      message: "This will immediately invalidate all user sessions except your own. All users will need to log in again.",
      confirmText: "Logout All",
      action: async () => {
        const res = await fetch(apiUrl("/api/admin/system/force-logout-all"), { method: "POST", credentials: "include" });
        setConfirmModal(null);
        if (res.ok) {
          reload();
          setToast("All users logged out");
        } else {
          setToast("Failed to logout users");
        }
      },
    });
  };

  const handleTerminateSession = async (session: Session) => {
    const res = await fetch(apiUrl(`/api/admin/system/sessions/${session.id}/terminate`), { method: "POST", credentials: "include" });
    if (res.ok) {
      reload();
      setToast(`Session for ${session.user} terminated`);
    } else {
      const d = await res.json().catch(() => ({}));
      setToast(d.detail ?? "Failed to terminate session");
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>System</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>
          Database maintenance and session management
        </p>
      </div>

      {/* Database Maintenance */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.125rem", color: "var(--text-muted)" }}>
          Database Maintenance
        </h2>
        <div
          style={{
            backgroundColor: "var(--bg-panel)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            padding: 20,
          }}
        >
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Cleanup Orphaned Records</h3>
              <p style={{ margin: "0 0 12px", color: "var(--text-muted)", fontSize: 13 }}>
                Remove database entries that reference deleted parent records.
              </p>
              <button
                type="button"
                className="theme-btn theme-btn-ghost"
                style={{ color: "var(--accent)" }}
                onClick={handleCleanupOrphans}
              >
                Run Cleanup
              </button>
            </div>
            <div style={{ flex: "1 1 280px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Vacuum / Optimize</h3>
              <p style={{ margin: "0 0 12px", color: "var(--text-muted)", fontSize: 13 }}>
                Reclaim storage space and optimize query performance.
              </p>
              <button
                type="button"
                className="theme-btn theme-btn-ghost"
                style={{ color: "var(--accent)" }}
                onClick={handleVacuumDB}
              >
                Run Vacuum
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Session Management */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text-muted)" }}>
            Active Sessions
          </h2>
          <button
            type="button"
            className="theme-btn"
            style={{ backgroundColor: "var(--error)", borderColor: "var(--error)", color: "#fff", fontSize: 13, padding: "6px 14px" }}
            onClick={handleForceLogoutAll}
          >
            Force Logout All
          </button>
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
                <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>User</th>
                <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>IP Address</th>
                <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Last Activity</th>
                <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Session Start</th>
                <th style={{ padding: "12px 16px", textAlign: "right", color: "var(--text-muted)", fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                    No active sessions
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>
                      {session.user}
                      {session.user === currentUsername && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)" }}>(you)</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                      {session.ip}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{formatTimeAgo(session.last_activity)}</td>
                    <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{formatTimeAgo(session.created_at)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        type="button"
                        className="theme-btn theme-btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12, color: "var(--error)" }}
                        onClick={() => handleTerminateSession(session)}
                        disabled={session.user === currentUsername}
                      >
                        Terminate
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* System Stats */}
      <section style={{ marginTop: 32 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.125rem", color: "var(--text-muted)" }}>
          System Stats
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {[
            { label: "Database Size", value: stats ? `${stats.database_size_mb} MB` : "—" },
            { label: "Total Records", value: stats ? stats.total_records.toLocaleString() : "—" },
            { label: "Uptime", value: stats?.uptime ?? "—" },
            { label: "API Requests (24h)", value: stats ? stats.api_requests_24h.toLocaleString() : "—" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: 16,
                backgroundColor: "var(--bg-panel)",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Confirmation Modal */}
      {confirmModal && (
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
          onClick={() => setConfirmModal(null)}
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
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>{confirmModal.title}</h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="theme-btn theme-btn-primary"
                style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }}
                onClick={confirmModal.action}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

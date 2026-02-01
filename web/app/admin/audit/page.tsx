"use client";

import { useState } from "react";

type AuditEvent = {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  target_type: string;
  target_id: string;
  target_name: string | null;
  details: string | null;
  ip: string;
};

// Mock audit events
const mockEvents: AuditEvent[] = [
  { id: "1", timestamp: new Date(Date.now() - 120000).toISOString(), user: "admin", action: "force_release_lock", target_type: "lock", target_id: "lock-123", target_name: null, details: "Released lock on host 10.0.0.1", ip: "192.168.1.100" },
  { id: "2", timestamp: new Date(Date.now() - 900000).toISOString(), user: "admin", action: "create_user", target_type: "user", target_id: "user-456", target_name: "jsmith", details: "Created operator account", ip: "192.168.1.100" },
  { id: "3", timestamp: new Date(Date.now() - 1800000).toISOString(), user: "jsmith", action: "login", target_type: "session", target_id: "sess-789", target_name: null, details: "Successful login", ip: "192.168.1.101" },
  { id: "4", timestamp: new Date(Date.now() - 3600000).toISOString(), user: "admin", action: "disable_user", target_type: "user", target_id: "user-111", target_name: "olduser", details: "Account disabled for inactivity", ip: "192.168.1.100" },
  { id: "5", timestamp: new Date(Date.now() - 7200000).toISOString(), user: "jsmith", action: "create_host", target_type: "host", target_id: "host-222", target_name: "10.0.0.5", details: null, ip: "192.168.1.101" },
  { id: "6", timestamp: new Date(Date.now() - 14400000).toISOString(), user: "admin", action: "delete_project", target_type: "project", target_id: "proj-333", target_name: "Old Test Project", details: "Project and all associated data deleted", ip: "192.168.1.100" },
  { id: "7", timestamp: new Date(Date.now() - 28800000).toISOString(), user: "admin", action: "bulk_export", target_type: "system", target_id: "export-444", target_name: null, details: "Exported 3 projects", ip: "192.168.1.100" },
  { id: "8", timestamp: new Date(Date.now() - 43200000).toISOString(), user: "operator1", action: "login_failed", target_type: "session", target_id: "sess-555", target_name: null, details: "Invalid password (attempt 2)", ip: "10.0.0.50" },
  { id: "9", timestamp: new Date(Date.now() - 86400000).toISOString(), user: "admin", action: "reset_password", target_type: "user", target_id: "user-666", target_name: "operator1", details: "Password reset requested", ip: "192.168.1.100" },
  { id: "10", timestamp: new Date(Date.now() - 172800000).toISOString(), user: "system", action: "cleanup_orphans", target_type: "system", target_id: "maint-777", target_name: null, details: "Removed 42 orphaned records", ip: "localhost" },
];

const actionColors: Record<string, { bg: string; color: string; border: string }> = {
  create: { bg: "rgba(72, 187, 120, 0.1)", color: "#48bb78", border: "rgba(72, 187, 120, 0.3)" },
  delete: { bg: "var(--error-bg)", color: "var(--error)", border: "var(--accent-dim)" },
  login: { bg: "rgba(66, 153, 225, 0.1)", color: "#4299e1", border: "rgba(66, 153, 225, 0.3)" },
  failed: { bg: "rgba(236, 201, 75, 0.1)", color: "#ecc94b", border: "rgba(236, 201, 75, 0.3)" },
  admin: { bg: "var(--accent-bg)", color: "var(--accent)", border: "var(--accent-dim)" },
};

const getActionColor = (action: string) => {
  if (action.includes("create") || action.includes("enable")) return actionColors.create;
  if (action.includes("delete") || action.includes("disable") || action.includes("force")) return actionColors.delete;
  if (action.includes("login") && !action.includes("failed")) return actionColors.login;
  if (action.includes("failed")) return actionColors.failed;
  return actionColors.admin;
};

export default function AdminAuditPage() {
  const [events] = useState<AuditEvent[]>(mockEvents);
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const formatTimestamp = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) {
      return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days === 1) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days < 7) {
      return `${days}d ago ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const filteredEvents = events.filter((e) => {
    if (filterUser && !e.user.toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (filterAction && !e.action.toLowerCase().includes(filterAction.toLowerCase())) return false;
    return true;
  });

  const uniqueUsers = Array.from(new Set(events.map((e) => e.user)));
  const uniqueActions = Array.from(new Set(events.map((e) => e.action)));

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Audit Log</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>
          View system and user activity history
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="theme-select"
          style={{ maxWidth: 180 }}
        >
          <option value="">All Users</option>
          {uniqueUsers.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="theme-select"
          style={{ maxWidth: 200 }}
        >
          <option value="">All Actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
        {(filterUser || filterAction) && (
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setFilterUser("");
              setFilterAction("");
            }}
          >
            Clear Filters
          </button>
        )}
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
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Timestamp</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>User</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Action</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Target</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Details</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                  No audit events found
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => {
                const colors = getActionColor(event.action);
                return (
                  <tr key={event.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {formatTimestamp(event.timestamp)}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>
                      {event.user}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          backgroundColor: colors.bg,
                          color: colors.color,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        {event.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{event.target_type}:</span>{" "}
                      <span style={{ fontWeight: 500 }}>{event.target_name || event.target_id.slice(0, 12)}</span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {event.details || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                      {event.ip}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination (Mock) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, color: "var(--text-muted)", fontSize: 13 }}>
        <span>Showing {filteredEvents.length} of {events.length} events</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "4px 12px", fontSize: 12 }} disabled>
            Previous
          </button>
          <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "4px 12px", fontSize: 12 }} disabled>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

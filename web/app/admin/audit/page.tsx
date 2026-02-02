"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";

type AuditEvent = {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  details: string | null;
  ip: string;
};

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
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const limit = 50;

  useEffect(() => {
    fetch(apiUrl("/api/admin/audit/filters"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        setUsers(d.users ?? []);
        setActions(d.actions ?? []);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));
    if (filterUser) params.set("username", filterUser);
    if (filterAction) params.set("action_type", filterAction);
    fetch(apiUrl(`/api/admin/audit?${params}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { events: [], total: 0 }))
      .then((d) => {
        setEvents(d.events ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, filterUser, filterAction]);

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

  const filteredEvents = events;

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
          onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
          className="theme-select"
          style={{ maxWidth: 180 }}
        >
          <option value="">All Users</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
          className="theme-select"
          style={{ maxWidth: 200 }}
        >
          <option value="">All Actions</option>
          {actions.map((a) => (
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
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : filteredEvents.length === 0 ? (
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
                      <span style={{ fontWeight: 500 }}>{event.target_name || (event.target_id ? event.target_id.slice(0, 12) : "—")}</span>
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

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, color: "var(--text-muted)", fontSize: 13 }}>
        <span>Showing {filteredEvents.length} of {total} events</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ padding: "4px 12px", fontSize: 12 }}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ padding: "4px 12px", fontSize: 12 }}
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

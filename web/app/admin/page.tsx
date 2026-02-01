"use client";

import Link from "next/link";

const stats = [
  { label: "Total Users", value: "3", href: "/admin/users" },
  { label: "Active Missions", value: "12", href: "/admin/missions" },
  { label: "Active Locks", value: "5", href: "/admin/locks" },
  { label: "Pending Jobs", value: "2", href: "/admin/system" },
];

const quickActions = [
  { label: "Create User", href: "/admin/users", action: "create" },
  { label: "View Audit Log", href: "/admin/audit" },
  { label: "Force Release All Locks", href: "/admin/locks", action: "release-all" },
  { label: "System Maintenance", href: "/admin/system" },
];

export default function AdminDashboard() {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem" }}>Admin Dashboard</h1>
      <p style={{ margin: "0 0 32px", color: "var(--text-muted)" }}>
        System overview and quick actions
      </p>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            style={{
              padding: 20,
              backgroundColor: "var(--bg-panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textDecoration: "none",
              color: "var(--text)",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{stat.value}</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Quick Actions</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="theme-btn theme-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            {action.label}
          </Link>
        ))}
      </div>

      {/* Recent Activity (Mock) */}
      <h2 style={{ margin: "32px 0 16px", fontSize: "1.25rem" }}>Recent Admin Activity</h2>
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
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Time</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Admin</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Action</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Target</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>2 min ago</td>
              <td style={{ padding: "12px 16px" }}>admin</td>
              <td style={{ padding: "12px 16px" }}>Force released lock</td>
              <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>host:10.0.0.1</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>15 min ago</td>
              <td style={{ padding: "12px 16px" }}>admin</td>
              <td style={{ padding: "12px 16px" }}>Created user</td>
              <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>user:jsmith</td>
            </tr>
            <tr>
              <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>1 hour ago</td>
              <td style={{ padding: "12px 16px" }}>admin</td>
              <td style={{ padding: "12px 16px" }}>Disabled user</td>
              <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>user:olduser</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

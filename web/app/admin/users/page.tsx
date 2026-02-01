"use client";

import { useEffect, useState } from "react";
import { Toast } from "../../components/toast";

type User = {
  id: string;
  username: string;
  role: string;
  created_at: string;
  disabled_at: string | null;
};

// Mock data for users
const mockUsers: User[] = [
  { id: "1", username: "admin", role: "admin", created_at: "2025-01-15T10:00:00Z", disabled_at: null },
  { id: "2", username: "jsmith", role: "operator", created_at: "2025-01-20T14:30:00Z", disabled_at: null },
  { id: "3", username: "olduser", role: "operator", created_at: "2025-01-10T09:00:00Z", disabled_at: "2025-01-25T16:00:00Z" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<User | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<User | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreate = async (username: string, password: string, role: string) => {
    // Stub: would call API
    const newUser: User = {
      id: String(Date.now()),
      username,
      role,
      created_at: new Date().toISOString(),
      disabled_at: null,
    };
    setUsers((prev) => [...prev, newUser]);
    setCreateModal(false);
    setToast(`User "${username}" created (stub)`);
  };

  const handleToggleDisable = (user: User) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, disabled_at: u.disabled_at ? null : new Date().toISOString() }
          : u
      )
    );
    setToast(user.disabled_at ? `User "${user.username}" enabled` : `User "${user.username}" disabled`);
  };

  const handleResetPassword = (user: User) => {
    setResetPasswordModal(null);
    setToast(`Password reset for "${user.username}" (stub)`);
  };

  const handleDelete = (user: User) => {
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    setDeleteModal(null);
    setToast(`User "${user.username}" deleted (stub)`);
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Users</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>
            Manage system users and access
          </p>
        </div>
        <button
          type="button"
          className="theme-btn theme-btn-primary"
          onClick={() => setCreateModal(true)}
        >
          + Create User
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
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Username</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Role</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Created</th>
              <th style={{ padding: "12px 16px", textAlign: "right", color: "var(--text-muted)", fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 500 }}>{user.username}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      backgroundColor: user.role === "admin" ? "var(--accent-bg)" : "var(--bg-elevated)",
                      color: user.role === "admin" ? "var(--accent)" : "var(--text-muted)",
                      border: `1px solid ${user.role === "admin" ? "var(--accent-dim)" : "var(--border)"}`,
                    }}
                  >
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {user.disabled_at ? (
                    <span style={{ color: "var(--error)" }}>Disabled</span>
                  ) : (
                    <span style={{ color: "#48bb78" }}>Active</span>
                  )}
                </td>
                <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => handleToggleDisable(user)}
                    >
                      {user.disabled_at ? "Enable" : "Disable"}
                    </button>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setResetPasswordModal(user)}
                    >
                      Reset Password
                    </button>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 12, color: "var(--error)" }}
                      onClick={() => setDeleteModal(user)}
                      disabled={user.username === "admin"}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {createModal && (
        <CreateUserModal
          onClose={() => setCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal && (
        <ResetPasswordModal
          user={resetPasswordModal}
          onClose={() => setResetPasswordModal(null)}
          onConfirm={() => handleResetPassword(resetPasswordModal)}
        />
      )}

      {/* Delete User Modal */}
      {deleteModal && (
        <DeleteUserModal
          user={deleteModal}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => handleDelete(deleteModal)}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (username: string, password: string, role: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    onSubmit(username.trim(), password, role);
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
          maxWidth: 400,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Create User</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="theme-input"
              placeholder="e.g. jsmith"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Temporary Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="theme-input"
              placeholder="Initial password"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="theme-select"
            >
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="theme-btn theme-btn-primary">
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onConfirm,
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
          maxWidth: 400,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Reset Password</h2>
        <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
          Reset password for user <strong>{user.username}</strong>? A new temporary password will be generated.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="theme-btn theme-btn-primary" onClick={onConfirm}>
            Reset Password
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteUserModal({
  user,
  onClose,
  onConfirm,
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === user.username;

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
          maxWidth: 400,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete User</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
          Type <strong>{user.username}</strong> to confirm deletion. This action cannot be undone.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={user.username}
          className="theme-input"
          style={{ marginBottom: 16, borderColor: matches ? "var(--accent)" : undefined }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-primary"
            disabled={!matches}
            onClick={onConfirm}
            style={matches ? { backgroundColor: "var(--error)", borderColor: "var(--error)" } : undefined}
          >
            Delete User
          </button>
        </div>
      </div>
    </div>
  );
}

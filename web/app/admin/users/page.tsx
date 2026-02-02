"use client";

import { useEffect, useState } from "react";
import { apiUrl, formatApiErrorDetail } from "../../lib/api";
import { Toast } from "../../components/toast";

type User = {
  id: string;
  username: string;
  role: string;
  created_at: string;
  disabled_at: string | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<User | null>(null);
  const [deleteModal, setDeleteModal] = useState<User | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<User | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCurrentUserId(d.id));
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/admin/users"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [createModal, editModal, deleteModal, resetPasswordModal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadUsers = () => {
    fetch(apiUrl("/api/admin/users"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers);
  };

  const handleCreate = async (username: string, password: string, role: string) => {
    const res = await fetch(apiUrl("/api/admin/users"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(formatApiErrorDetail(data.detail, "Failed to create user"));
      return;
    }
    setCreateModal(false);
    loadUsers();
    setToast(`User "${username}" created`);
  };

  const handleToggleDisable = async (user: User) => {
    const endpoint = user.disabled_at ? "enable" : "disable";
    const res = await fetch(apiUrl(`/api/admin/users/${user.id}/${endpoint}`), {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(formatApiErrorDetail(data.detail, "Action failed"));
      return;
    }
    loadUsers();
    setToast(user.disabled_at ? `User "${user.username}" enabled` : `User "${user.username}" disabled`);
  };

  const handleResetPassword = async (user: User, temporaryPassword: string) => {
    const res = await fetch(apiUrl(`/api/admin/users/${user.id}/reset-password`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temporary_password: temporaryPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(formatApiErrorDetail(data.detail, "Reset failed"));
      return;
    }
    setResetPasswordModal(null);
    loadUsers();
    setToast(`Password reset for "${user.username}"`);
  };

  const handleUpdate = async (user: User, username: string, password: string, role: string) => {
    const body: { username: string; password?: string; role: string } = {
      username: username.trim(),
      role: role,
    };
    if (password && password.length >= 8) body.password = password;
    const res = await fetch(apiUrl(`/api/admin/users/${user.id}`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(formatApiErrorDetail(data.detail, "Update failed"));
      return;
    }
    setEditModal(null);
    loadUsers();
    setToast(`User "${username.trim() || user.username}" updated`);
  };

  const handleDelete = async (user: User) => {
    const res = await fetch(apiUrl(`/api/admin/users/${user.id}`), {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(formatApiErrorDetail(data.detail, "Delete failed"));
      return;
    }
    setDeleteModal(null);
    loadUsers();
    setToast(`User "${user.username}" deleted`);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, color: "var(--text-muted)" }}>Loading users…</div>
    );
  }

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
              <tr
                key={user.id}
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                }}
                onClick={() => setEditModal(user)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--tree-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
              >
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
                    {user.role === "user" ? "operator" : user.role}
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
                <td style={{ padding: "12px 16px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="theme-btn theme-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => handleToggleDisable(user)}
                      disabled={user.role === "admin"}
                      title={user.role === "admin" ? "Admin accounts cannot be disabled" : undefined}
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
                      disabled={user.id === currentUserId}
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

      {/* Edit User Modal */}
      {editModal && (
        <EditUserModal
          user={editModal}
          onClose={() => setEditModal(null)}
          onSave={(username, password, role) => handleUpdate(editModal, username, password, role)}
        />
      )}

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
          onConfirm={(pw) => handleResetPassword(resetPasswordModal, pw)}
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

function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (username: string, password: string, role: string) => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user.role === "user" ? "operator" : "admin");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (password && password.length < 8) return;
    onSave(username.trim(), password, role);
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Edit User</h2>
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
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>New password (leave blank to keep current)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="theme-input"
              placeholder="Min 8 characters"
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
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
  onConfirm: (temporaryPassword: string) => void;
}) {
  const [password, setPassword] = useState("");

  const handleSubmit = () => {
    if (!password || password.length < 8) return;
    onConfirm(password);
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
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Reset Password</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
          Set a new temporary password for user <strong>{user.username}</strong>.
        </p>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Temporary Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="theme-input"
            placeholder="Min 8 characters"
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-primary"
            onClick={handleSubmit}
            disabled={!password || password.length < 8}
          >
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl, formatApiErrorDetail } from "../lib/api";

export type Todo = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  subnet_id: string | null;
  host_id: string | null;
  port_id: string | null;
  assigned_to_user_id: string | null;
  assigned_to_username: string | null;
  created_at: string;
  updated_at: string;
};

type SubnetLike = { id: string; cidr: string; name?: string | null };
type HostLike = { id: string; ip: string; dns_name?: string | null };
type PortLike = { id: string; number: number; protocol: string };
type UserOption = { id: string; username: string; role: string };

type TodosPanelProps = {
  projectId: string;
  onToast?: (msg: string) => void;
  onFocusNode?: (node: { type: "subnet" | "host" | "port"; id: string }) => void;
  /** When this value changes, the panel refetches (e.g. after adding a todo from a node). */
  refreshTrigger?: number;
  subnets?: SubnetLike[];
  hosts?: HostLike[];
  portsByHost?: Record<string, PortLike[]>;
  users?: UserOption[];
};

function todoLinkLabel(
  t: Todo,
  subnets?: SubnetLike[],
  hosts?: HostLike[],
  portsByHost?: Record<string, PortLike[]>
): string | null {
  if (t.port_id && hosts && portsByHost) {
    for (const h of hosts) {
      const port = (portsByHost[h.id] ?? []).find((p) => p.id === t.port_id);
      if (port) return `Port ${port.number}/${port.protocol} on ${h.ip}`;
    }
  }
  if (t.host_id && hosts) {
    const h = hosts.find((x) => x.id === t.host_id);
    if (h) return h.dns_name ? `${h.ip} (${h.dns_name})` : h.ip;
  }
  if (t.subnet_id && subnets) {
    const s = subnets.find((x) => x.id === t.subnet_id);
    if (s) return `Subnet ${s.cidr}${s.name ? ` (${s.name})` : ""}`;
  }
  return null;
}

export function TodosPanel({ projectId, onToast, onFocusNode, refreshTrigger, subnets, hosts, portsByHost, users = [] }: TodosPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const statusQ = filter === "all" ? "" : `&status=${filter}`;
    fetch(apiUrl(`/api/todos?project_id=${projectId}${statusQ}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Todo[]) => setTodos(Array.isArray(list) ? list : []))
      .catch(() => setTodos([]))
      .finally(() => setLoading(false));
  }, [projectId, filter]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const createTodo = () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    fetch(apiUrl("/api/todos"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title,
        description: newDesc.trim() || null,
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(formatApiErrorDetail(d?.detail, "Create failed")); });
        return r.json();
      })
      .then((t: Todo) => {
        setTodos((prev) => [t, ...prev]);
        setNewTitle("");
        setNewDesc("");
        onToast?.("Todo added");
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : "Failed to create"))
      .finally(() => setCreating(false));
  };

  const patchTodo = (id: string, patch: { status?: string; assigned_to_user_id?: string | null }) => {
    fetch(apiUrl(`/api/todos/${id}`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Update failed");
        return r.json();
      })
      .then((t: Todo) => {
        setTodos((prev) => prev.map((x) => (x.id === id ? t : x)));
        if (patch.status !== undefined) onToast?.(patch.status === "done" ? "Marked done" : "Reopened");
        if (patch.assigned_to_user_id !== undefined) onToast?.("Assignee updated");
      })
      .catch(() => onToast?.("Update failed"));
  };

  const deleteTodo = (id: string) => {
    fetch(apiUrl(`/api/todos/${id}`), { method: "DELETE", credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Delete failed");
        setTodos((prev) => prev.filter((x) => x.id !== id));
        onToast?.("Todo deleted");
      })
      .catch(() => onToast?.("Delete failed"));
  };

  const focusTodo = (t: Todo) => {
    if (t.port_id && onFocusNode) {
      onFocusNode({ type: "port", id: t.port_id });
    } else if (t.host_id && onFocusNode) {
      onFocusNode({ type: "host", id: t.host_id });
    } else if (t.subnet_id && onFocusNode) {
      onFocusNode({ type: "subnet", id: t.subnet_id });
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Todos</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <select
          className="theme-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "open" | "done")}
          style={{ width: "auto", fontSize: 14 }}
        >
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="all">All</option>
        </select>
      </div>
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          className="theme-input"
          placeholder="New todo title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createTodo()}
        />
        <input
          className="theme-input"
          placeholder="Description (optional)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
        />
        <button
          type="button"
          className="theme-btn theme-btn-primary"
          onClick={createTodo}
          disabled={!newTitle.trim() || creating}
        >
          Add todo
        </button>
      </div>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : todos.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No todos.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {todos.map((t) => (
            <li
              key={t.id}
              style={{
                padding: 12,
                marginBottom: 8,
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                textDecoration: t.status === "done" ? "line-through" : undefined,
                color: t.status === "done" ? "var(--text-muted)" : "var(--text)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div
                  style={{ flex: 1, cursor: t.subnet_id || t.host_id || t.port_id ? "pointer" : undefined }}
                  onClick={() => (t.subnet_id || t.host_id || t.port_id ? focusTodo(t) : undefined)}
                  role={t.subnet_id || t.host_id || t.port_id ? "button" : undefined}
                  title={t.subnet_id || t.host_id || t.port_id ? "Go to linked scope item" : undefined}
                >
                  <strong>{t.title}</strong>
                  {(subnets || hosts || portsByHost) && todoLinkLabel(t, subnets, hosts, portsByHost) && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      → {todoLinkLabel(t, subnets, hosts, portsByHost)}
                    </div>
                  )}
                  {t.description && (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t.description}</div>
                  )}
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {t.assigned_to_username ? `Assigned to: ${t.assigned_to_username}` : "Unassigned"}
                    {users.length > 0 && (
                      <select
                        className="theme-select"
                        value={t.assigned_to_user_id ?? ""}
                        onChange={(e) => patchTodo(t.id, { assigned_to_user_id: e.target.value || null })}
                        style={{ marginLeft: 8, fontSize: 12, padding: "2px 6px", width: "auto" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">— Unassigned —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="theme-btn theme-btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => patchTodo(t.id, { status: t.status === "done" ? "open" : "done" })}
                  >
                    {t.status === "done" ? "Reopen" : "Done"}
                  </button>
                  <button
                    type="button"
                    className="theme-btn theme-btn-ghost"
                    style={{ fontSize: 12, color: "var(--error)" }}
                    onClick={() => deleteTodo(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

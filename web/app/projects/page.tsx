"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "../lib/api";

type Project = {
  id: string;
  name: string;
  description: string | null;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadProjects = useCallback(() => {
    fetch(apiUrl("/api/projects"), { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load projects");
        return r.json();
      })
      .then(setProjects)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!formName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl("/api/projects"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim() || null,
          countdown_red_days_default: 7,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create project");
      }
      setFormName("");
      setFormDesc("");
      setShowForm(false);
      loadProjects();
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <main style={{ padding: 24, color: "var(--text)" }}>Loading projects…</main>;
  if (error)
    return (
      <main style={{ padding: 24, color: "var(--error)" }}>
        Error: {error}
      </main>
    );

  return (
    <main style={{ padding: 24, color: "var(--text)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Projects</h1>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Select a project to start</span>
        <button type="button" onClick={() => setShowForm(true)} className="theme-btn theme-btn-primary" style={{ marginLeft: "auto" }}>
          + New project
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            padding: 20,
            backgroundColor: "var(--bg-panel)",
            color: "var(--text)",
            borderRadius: 8,
            marginBottom: 24,
            maxWidth: 400,
            border: "1px solid var(--border)",
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: "1.125rem" }}>Create project</h2>
          {createError && (
            <p style={{ color: "var(--error)", fontSize: 14, marginBottom: 12 }}>{createError}</p>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Name</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="e.g. Acme Corp engagement" className="theme-input" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Description (optional)</label>
            <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description" className="theme-input" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={creating || !formName.trim()} className="theme-btn theme-btn-primary">
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setCreateError(""); setFormName(""); setFormDesc(""); }} className="theme-btn theme-btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No projects yet. Click &quot;New project&quot; to create one.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {projects.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <Link
                href={`/projects/${p.id}`}
                style={{
                  display: "block",
                  padding: "12px 16px",
                  backgroundColor: "var(--bg-panel)",
                  borderRadius: 8,
                  color: "var(--text)",
                  textDecoration: "none",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.description && <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 14 }}>{p.description}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

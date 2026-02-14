"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";
import { Toast } from "../../components/toast";

type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type TagRecord = {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
};

export default function AdminTagsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTags, setLoadingTags] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/projects"), { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          if (data.length > 0 && !selectedProjectId) {
            setSelectedProjectId(data[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setTags([]);
      return;
    }
    setLoadingTags(true);
    fetch(apiUrl(`/api/projects/${selectedProjectId}/tags`), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => setTags([]))
      .finally(() => setLoadingTags(false));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleDeleteTag = async (tag: TagRecord) => {
    if (!selectedProjectId) return;
    setDeletingId(tag.id);
    try {
      const res = await fetch(apiUrl(`/api/projects/${selectedProjectId}/tags/${tag.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok || res.status === 204) {
        setTags((prev) => prev.filter((t) => t.id !== tag.id));
        setToast(`Tag "${tag.name}" deleted`);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(typeof data.detail === "string" ? data.detail : "Delete failed");
      }
    } catch {
      setToast("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (loadingProjects) {
    return (
      <div style={{ padding: 32, color: "var(--text-muted)" }}>Loading missions…</div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Tags</h1>
      <p style={{ margin: "4px 0 24px", color: "var(--text-muted)", fontSize: 14 }}>
        Delete tags from a mission. Select a mission to view and manage its tags.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="admin-tags-project" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-muted)" }}>
          Mission
        </label>
        <select
          id="admin-tags-project"
          value={selectedProjectId ?? ""}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="theme-input"
          style={{ minWidth: 280 }}
        >
          <option value="">Select a mission</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProjectId && (
        <div
          style={{
            backgroundColor: "var(--bg-panel)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {loadingTags ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading tags…</div>
          ) : tags.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No tags in this mission</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Name</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Color</th>
                  <th style={{ padding: "12px 16px", textAlign: "right", color: "var(--text-muted)", fontWeight: 500 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>{tag.name}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {tag.color ? (
                        <span
                          style={{
                            display: "inline-block",
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            backgroundColor: tag.color,
                            border: "1px solid var(--border)",
                          }}
                          title={tag.color}
                        />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        type="button"
                        className="theme-btn theme-btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12, color: "var(--error)" }}
                        disabled={deletingId === tag.id}
                        onClick={() => handleDeleteTag(tag)}
                      >
                        {deletingId === tag.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

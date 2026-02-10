"use client";

import { useState } from "react";
import { Logo } from "../components/logo";
import { apiUrl } from "../lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail[0]?.msg ?? String(data.detail[0] ?? "Login failed")
              : "Login failed";
        setError(msg);
        return;
      }
      // Brief delay so the browser commits the Set-Cookie before we navigate away
      await new Promise((r) => setTimeout(r, 100));
      window.location.href = "/";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 400,
        margin: "48px auto",
        backgroundColor: "var(--bg-panel)",
        borderRadius: 8,
        color: "var(--text)",
        border: "1px solid var(--border)",
      }}
    >
      <Logo variant="auth" />
      <h1 style={{ margin: "0 0 24px", fontSize: "1.5rem" }}>Log in</h1>
      <form onSubmit={handleSubmit}>
        {error && (
          <p style={{ color: "var(--error)", fontSize: 14, marginBottom: 16 }}>{error}</p>
        )}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="username" style={{ display: "block", marginBottom: 6, fontSize: 14 }}>Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="theme-input"
            style={{ fontSize: 16 }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: 6, fontSize: 14 }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="theme-input"
            style={{ fontSize: 16 }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="theme-btn theme-btn-primary"
          style={{ width: "100%", padding: "10px 16px", fontSize: 16, fontWeight: 600 }}
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}

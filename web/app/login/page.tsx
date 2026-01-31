"use client";

import { useState } from "react";
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
        backgroundColor: "#1a202c",
        borderRadius: 8,
        color: "#e2e8f0",
      }}
    >
      <h1 style={{ margin: "0 0 24px", fontSize: "1.5rem" }}>Log in</h1>
      <form onSubmit={handleSubmit}>
        {error && (
          <p
            style={{
              color: "#fc8181",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {error}
          </p>
        )}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="username"
            style={{ display: "block", marginBottom: 6, fontSize: 14 }}
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 16,
              border: "1px solid #4a5568",
              borderRadius: 4,
              backgroundColor: "#2d3748",
              color: "#e2e8f0",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="password"
            style={{ display: "block", marginBottom: 6, fontSize: 14 }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 16,
              border: "1px solid #4a5568",
              borderRadius: 4,
              backgroundColor: "#2d3748",
              color: "#e2e8f0",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 16px",
            fontSize: 16,
            fontWeight: 600,
            color: "#1a202c",
            backgroundColor: "#e2e8f0",
            border: "none",
            borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}

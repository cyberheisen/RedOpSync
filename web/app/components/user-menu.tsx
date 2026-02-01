"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "../lib/api";

type User = { id: string; username: string; role: string } | null;

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    router.replace("/login");
  }

  if (loading) return <span style={{ color: "var(--text-muted)", fontSize: 14 }}>…</span>;
  if (!user) {
    return (
      <Link
        href="/login"
        className="theme-btn theme-btn-primary"
        style={{ fontSize: 14, padding: "6px 12px", textDecoration: "none" }}
      >
        Log in
      </Link>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: "var(--text)", fontSize: 14 }}>{user.username}</span>
      <button type="button" onClick={handleLogout} className="theme-btn theme-btn-ghost" style={{ padding: "6px 12px", fontSize: 14 }}>
        Log out
      </button>
    </div>
  );
}

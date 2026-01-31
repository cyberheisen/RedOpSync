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

  if (loading) return <span style={{ color: "#a0aec0", fontSize: 14 }}>…</span>;
  if (!user) {
    return (
      <Link
        href="/login"
        style={{
          color: "#fff",
          fontSize: 14,
          textDecoration: "none",
          padding: "6px 12px",
          border: "1px solid #fff",
          borderRadius: 4,
        }}
      >
        Log in
      </Link>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: "#e2e8f0", fontSize: 14 }}>{user.username}</span>
      <button
        type="button"
        onClick={handleLogout}
        style={{
          background: "transparent",
          color: "#e2e8f0",
          border: "1px solid #e2e8f0",
          borderRadius: 4,
          padding: "6px 12px",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Log out
      </button>
    </div>
  );
}

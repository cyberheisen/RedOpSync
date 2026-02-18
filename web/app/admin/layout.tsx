"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { User, FolderOpen, Lock, Package, Settings, ScrollText, Tag } from "lucide-react";
import { apiUrl } from "../lib/api";
import { ChangePasswordModal } from "../components/change-password-modal";
import { Logo } from "../components/logo";

type UserType = { id: string; username: string; role: string; must_change_password?: boolean } | null;

const navIconStyle = { width: 18, height: 18, flexShrink: 0 };

const navItems: { href: string; label: string; Icon: React.ComponentType<{ style?: React.CSSProperties }> }[] = [
  { href: "/admin/users", label: "Users", Icon: User },
  { href: "/admin/missions", label: "Missions", Icon: FolderOpen },
  { href: "/admin/tags", label: "Tags", Icon: Tag },
  { href: "/admin/locks", label: "Locks", Icon: Lock },
  { href: "/admin/imports-exports", label: "Imports / Exports", Icon: Package },
  { href: "/admin/system", label: "System", Icon: Settings },
  { href: "/admin/audit", label: "Audit", Icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserType>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.role !== "admin") {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        setUser(data);
        setLoading(false);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  async function handleLogout() {
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
    router.replace("/login");
  }

  const refreshMe = useCallback(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser);
  }, []);

  const fontFamily = "var(--font-sans)";
  const mustChangePassword = Boolean(user?.must_change_password);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontFamily }}>
        Checking admin access…
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div style={{ padding: 48, textAlign: "center", fontFamily }}>
        <h1 style={{ color: "var(--error)", marginBottom: 16 }}>Access Denied</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
          You do not have permission to access the Admin section.
        </p>
        <Link href="/missions" className="theme-btn theme-btn-primary">
          Return to Missions
        </Link>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", fontFamily }}>
        <aside
          style={{
            width: 220,
            backgroundColor: "#0a0c0f",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            fontFamily,
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <Link href="/admin" style={{ textDecoration: "none" }}>
              <Logo variant="nav" />
            </Link>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "var(--accent)",
                padding: "4px 8px",
                backgroundColor: "var(--accent-bg)",
                borderRadius: 4,
                display: "inline-block",
              }}
            >
              Admin Console
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)" }}>
            Change password required
          </div>
        </aside>
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg)" }}>
          <ChangePasswordModal required onClose={() => {}} onSuccess={refreshMe} />
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily }}>
      {/* Admin Sidebar */}
      <aside
        style={{
          width: 220,
          backgroundColor: "#0a0c0f",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          fontFamily,
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Logo variant="nav" />
          </Link>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--accent)",
              padding: "4px 8px",
              backgroundColor: "var(--accent-bg)",
              borderRadius: 4,
              display: "inline-block",
            }}
          >
            Admin Console
          </div>
        </div>

        <nav style={{ flex: 1, padding: "12px 0" }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const isDestructive = item.label === "System";
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 20px",
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  backgroundColor: isActive ? "var(--accent-bg)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                  textDecoration: "none",
                  fontSize: 14,
                  transition: "all 0.15s",
                }}
              >
                <Icon style={navIconStyle} />
                <span style={{ color: isDestructive && !isActive ? "var(--accent)" : undefined }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
          <Link
            href="/missions"
            style={{
              display: "block",
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--text-muted)",
              textDecoration: "none",
              marginBottom: 8,
            }}
          >
            ← Back to Missions
          </Link>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            {user?.username}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="theme-btn theme-btn-ghost"
            style={{ width: "100%", fontSize: 13, padding: "6px 12px" }}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, backgroundColor: "var(--bg)", overflow: "auto", fontFamily }}>
        {children}
      </main>
    </div>
  );
}

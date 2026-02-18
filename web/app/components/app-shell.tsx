"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "../lib/api";
import { APP_VERSION } from "../lib/version";
import { ChangePasswordModal } from "./change-password-modal";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

type User = { id: string; username: string; role: string; must_change_password?: boolean } | null;

const mainNavItems = [
  { href: "/missions", label: "Missions", icon: "📁" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const isLogin = pathname === "/login";
  const isAdmin = pathname?.startsWith("/admin");

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
    router.replace("/login");
  }

  const showMainSidebar = !isLogin && !isAdmin && user;
  const mustChangePassword = Boolean(user?.must_change_password);

  const refreshMe = useCallback(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser);
  }, []);

  if (isLogin) {
    return (
      <>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 24px",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--bg-panel)",
          }}
        >
          <Logo variant="nav" />
        </header>
        <div style={{ flex: 1 }}>{children}</div>
        <footer
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--bg-panel)",
            color: "var(--text-muted)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>© {new Date().getFullYear()} RedOpSync</span>
          <span>·</span>
          <span>v{APP_VERSION}</span>
          <span>·</span>
          <span>Licensed under the MIT License</span>
          <span>·</span>
          <a href="/LICENSE" className="theme-link" target="_blank" rel="noopener noreferrer">
            MIT License
          </a>
        </footer>
      </>
    );
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  if (showMainSidebar && mustChangePassword) {
    return (
      <>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 24px",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--bg-panel)",
          }}
        >
          <Logo variant="nav" />
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Change password required</span>
        </header>
        <div style={{ flex: 1 }} />
        <ChangePasswordModal required onClose={() => {}} onSuccess={refreshMe} />
      </>
    );
  }

  if (!showMainSidebar) {
    return (
      <>
        {!loading && user && (
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 24px",
              borderBottom: "1px solid var(--border)",
              backgroundColor: "var(--bg-panel)",
            }}
          >
            <Logo variant="nav" />
            <Link href="/missions" className="theme-link" style={{ fontSize: 14 }}>
              Missions
            </Link>
            <Link href="/login" className="theme-btn theme-btn-ghost" style={{ fontSize: 13, padding: "6px 12px", textDecoration: "none" }}>
              Log in
            </Link>
          </header>
        )}
        <div style={{ flex: 1 }}>{children}</div>
        <footer
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--bg-panel)",
            color: "var(--text-muted)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>© {new Date().getFullYear()} RedOpSync</span>
          <span>·</span>
          <span>v{APP_VERSION}</span>
          <span>·</span>
          <span>Licensed under the MIT License</span>
          <span>·</span>
          <a href="/LICENSE" className="theme-link" target="_blank" rel="noopener noreferrer">
            MIT License
          </a>
        </footer>
      </>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Main app sidebar - matches admin panel style */}
        <aside
          style={{
            width: 220,
            backgroundColor: "#0a0c0f",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <Link href="/missions" style={{ textDecoration: "none" }}>
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
              Missions
            </div>
          </div>

          <nav style={{ flex: 1, padding: "12px 0" }}>
            {mainNavItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
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
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {user?.role === "admin" && (
              <Link
                href="/admin"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 20px",
                  color: pathname?.startsWith("/admin") ? "var(--text)" : "var(--accent)",
                  backgroundColor: pathname?.startsWith("/admin") ? "var(--accent-bg)" : "transparent",
                  borderLeft: pathname?.startsWith("/admin") ? "3px solid var(--accent)" : "3px solid transparent",
                  textDecoration: "none",
                  fontSize: 14,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>⚙️</span>
                <span>Admin</span>
              </Link>
            )}
          </nav>

          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
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

        <main style={{ flex: 1, backgroundColor: "var(--bg)", overflow: "auto", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              backgroundColor: "var(--bg-panel)",
              flexShrink: 0,
            }}
          >
            <UserMenu />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        </main>
      </div>

      <footer
        style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--bg-panel)",
          color: "var(--text-muted)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <span>© {new Date().getFullYear()} RedOpSync</span>
        <span>·</span>
        <span>v{APP_VERSION}</span>
        <span>·</span>
        <span>Licensed under the MIT License</span>
        <span>·</span>
        <a href="/LICENSE" className="theme-link" target="_blank" rel="noopener noreferrer">
          MIT License
        </a>
      </footer>
    </div>
  );
}

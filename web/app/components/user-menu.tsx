"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "../lib/api";
import { ChangePasswordModal } from "./change-password-modal";
import { ProfileModal } from "./profile-modal";

type User = { id: string; username: string; role: string } | null;

const DEFAULT_AVATAR = "/redop.png";
const AVATAR_SIZE = 44;

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        setUser(data);
        if (data?.username) setDisplayName(data.username);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  async function handleLogout() {
    setDropdownOpen(false);
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
    router.replace("/login");
  }

  function handleProfileClick() {
    setDropdownOpen(false);
    setProfileModalOpen(true);
  }

  if (loading) return <span style={{ color: "var(--text-muted)", fontSize: 14 }}>…</span>;
  if (!user) {
    return (
      <Link
        href="/login"
        className="theme-btn theme-btn-primary"
        style={{ fontSize: 14, padding: "6px 12px", textDecoration: "none", marginLeft: "auto" }}
      >
        Log in
      </Link>
    );
  }

  const avatarSrc = avatarUrl || DEFAULT_AVATAR;

  return (
    <div
      ref={dropdownRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        marginLeft: "auto",
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={() => setDropdownOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          borderRadius: "50%",
          overflow: "hidden",
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
        }}
        aria-label="User menu"
      >
        <img
          src={avatarSrc}
          alt=""
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            objectFit: "cover",
            borderRadius: "50%",
            display: "block",
          }}
        />
      </button>

      {dropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            backgroundColor: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 16px 4px",
            minWidth: 180,
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            {displayName || user.username}
          </div>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              borderRadius: 0,
              border: "none",
              padding: "10px 16px",
            }}
            onClick={handleProfileClick}
          >
            Profile
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              borderRadius: 0,
              border: "none",
              padding: "10px 16px",
            }}
            onClick={() => {
              setDropdownOpen(false);
              setChangePasswordModalOpen(true);
            }}
          >
            Change Password
          </button>
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="theme-btn theme-btn-ghost"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                borderRadius: 0,
                border: "none",
                padding: "10px 16px",
                textDecoration: "none",
                color: "var(--accent)",
              }}
              onClick={() => setDropdownOpen(false)}
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              borderRadius: 0,
              border: "none",
              padding: "10px 16px",
            }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}

      {changePasswordModalOpen && (
        <ChangePasswordModal onClose={() => setChangePasswordModalOpen(false)} />
      )}

      {profileModalOpen && (
        <ProfileModal
          displayName={displayName}
          avatarUrl={avatarUrl ?? DEFAULT_AVATAR}
          onClose={() => setProfileModalOpen(false)}
          onSave={(name, url) => {
            setDisplayName(name);
            setAvatarUrl(url || null);
          }}
        />
      )}
    </div>
  );
}

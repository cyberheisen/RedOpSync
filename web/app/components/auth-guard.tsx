"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiUrl } from "../lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((res) => {
        if (pathname === "/login") {
          if (res.ok) router.replace("/");
          else setReady(true);
          return;
        }
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (pathname === "/login") setReady(true);
        else router.replace("/login");
      });
  }, [pathname, router]);

  if (!ready) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Checking auth…</div>
    );
  }
  return <>{children}</>;
}

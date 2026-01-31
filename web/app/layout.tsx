export const metadata = {
  title: "RedOpSync",
  description: "Collaborative red-team engagement portal",
};

import { AuthGuard } from "./components/auth-guard";
import { UserMenu } from "./components/user-menu";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 24px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#1a202c" }}>
          <img src="/logo.svg" alt="RedOpSync" height={32} style={{ display: "block", width: "auto" }} />
          <UserMenu />
        </header>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}

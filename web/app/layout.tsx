import { AuthGuard } from "./components/auth-guard";
import { Logo } from "./components/logo";
import { UserMenu } from "./components/user-menu";
import { APP_VERSION } from "./lib/version";

export const metadata = {
  title: "RedOpSync",
  description: "Collaborative red-team engagement portal",
};

const themeStyles = `
:root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--bg:#0B0D10;--bg-panel:#11151B;--bg-elevated:#161B24;--text:#e2e8f0;--text-muted:#8b95a5;--text-dim:#6b7280;--accent:#E10600;--accent-dim:rgba(225,6,0,.6);--accent-bg:rgba(225,6,0,.12);--tree-bg:#0f1218;--tree-hover:#1a1f2a;--tree-selected-bg:rgba(225,6,0,.15);--tree-selected-border:var(--accent);--border:#252b36;--border-subtle:#1c2129;--input-bg:#161B24;--input-border:#252b36;--input-focus:var(--accent);--btn-bg:#1a1f2a;--btn-border:#252b36;--btn-hover:#252b36;--btn-primary-bg:var(--accent);--btn-primary-hover:#c90500;--error:#fc8181;--error-bg:rgba(252,129,129,.12);--lock-bg:rgba(225,6,0,.1);--lock-border:var(--accent-dim)}
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-sans);background:var(--bg);color:var(--text)}
.theme-btn{padding:8px 16px;font-size:14px;border-radius:6px;cursor:pointer;border:1px solid var(--btn-border);background:var(--btn-bg);color:var(--text);transition:background .15s,border-color .15s}
.theme-btn:hover:not(:disabled){background:var(--btn-hover)}
.theme-btn:disabled{cursor:not-allowed;opacity:.6}
.theme-btn-primary{background:var(--btn-primary-bg);border-color:var(--btn-primary-bg);color:#fff}
.theme-btn-primary:hover:not(:disabled){background:var(--btn-primary-hover);border-color:var(--btn-primary-hover)}
.theme-btn-ghost{background:transparent;color:var(--text-muted);border-color:var(--btn-border)}
.theme-btn-ghost:hover:not(:disabled){color:var(--text);background:var(--btn-hover)}
.theme-input,.theme-select{width:100%;padding:8px 12px;font-size:14px;border:1px solid var(--input-border);border-radius:4px;background:var(--input-bg);color:var(--text);box-sizing:border-box}
.theme-input:focus,.theme-select:focus{outline:none;border-color:var(--input-focus)}
.theme-input::placeholder{color:var(--text-dim)}
.theme-select option{background:var(--bg-panel);color:var(--text)}
.theme-link{color:var(--accent);text-decoration:none}
.theme-link:hover{text-decoration:underline}
a[href^="/missions/"]{transition:background .15s,border-color .15s}
a[href^="/missions/"]:hover{background:var(--tree-hover)!important;border-color:var(--accent-dim)!important}
.theme-tree-node{display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;min-height:24px;border-left:3px solid transparent;transition:background .1s}
.theme-tree-node:hover{background:var(--tree-hover)}
.theme-tree-node.selected{background:var(--tree-selected-bg);border-left-color:var(--tree-selected-border)}
.theme-lock{background:var(--lock-bg);border:1px solid var(--lock-border);color:var(--accent)}
.theme-badge{padding:2px 8px;font-size:11px;border-radius:4px;border:1px solid var(--border);color:var(--text-muted)}
.theme-badge-critical,.theme-badge-high{border-color:var(--accent);color:var(--accent);background:var(--accent-bg)}
.note-markdown-content h1,.note-markdown-content h2,.note-markdown-content h3{margin:1em 0 .5em;font-weight:600}
.note-markdown-content h1{font-size:1.25rem}.note-markdown-content h2{font-size:1.1rem}.note-markdown-content h3{font-size:1rem}
.note-markdown-content pre,.note-markdown-content code{background:var(--bg-panel);border-radius:4px;font-family:ui-monospace,monospace;font-size:13px}
.note-markdown-content pre{padding:12px;overflow-x:auto;margin:.5em 0}
.note-markdown-content code{padding:2px 6px}
.note-markdown-content pre code{padding:0}
.note-markdown-content ul{margin:.5em 0;padding-left:1.5em}
.note-markdown-content a{color:var(--accent);text-decoration:none}
.note-markdown-content a:hover{text-decoration:underline}
.note-markdown-content table{border-collapse:collapse;width:100%;margin:.5em 0}
.note-markdown-content th,.note-markdown-content td{border:1px solid var(--border);padding:6px 10px;text-align:left}
.note-markdown-content th{background:var(--bg-panel)}
.note-markdown-preview h1,.note-markdown-preview h2,.note-markdown-preview h3{margin:.5em 0}
.note-markdown-preview table{border-collapse:collapse;width:100%;margin:.5em 0}
.note-markdown-preview th,.note-markdown-preview td{border:1px solid var(--border);padding:6px 10px;text-align:left}
.note-markdown-preview th{background:var(--bg-panel)}
.note-markdown-preview pre,.note-markdown-preview code{background:var(--bg-panel);border-radius:4px;font-size:12px}
.note-markdown-preview ul{padding-left:1.5em}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
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
          <UserMenu />
        </header>
        <AuthGuard>
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
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
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}

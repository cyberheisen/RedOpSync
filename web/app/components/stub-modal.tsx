"use client";

type Props = {
  title: string;
  message?: string;
  onClose: () => void;
};

export function StubModal({ title, message = "Coming soon (stub)", onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--bg-panel)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          padding: 24,
          maxWidth: 360,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="theme-btn theme-btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

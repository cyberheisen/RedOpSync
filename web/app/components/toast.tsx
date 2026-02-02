"use client";

type Props = {
  message: React.ReactNode;
};

export function Toast({ message }: Props) {
  const display = typeof message === "string" ? message : (message != null ? String(message) : "");
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--accent)",
        borderRadius: 8,
        padding: "12px 20px",
        color: "var(--text)",
        fontSize: 14,
        zIndex: 1001,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
      >
      {display}
    </div>
  );
}

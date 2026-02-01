"use client";

type Props = {
  message: string;
};

export function Toast({ message }: Props) {
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
      {message}
    </div>
  );
}

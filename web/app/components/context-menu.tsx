"use client";

import { useEffect } from "react";

export type ContextMenuItem = {
  label: string;
  onClick: () => void;
};

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 160,
        zIndex: 999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className="theme-btn theme-btn-ghost"
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            borderRadius: 0,
            border: "none",
            padding: "8px 16px",
          }}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

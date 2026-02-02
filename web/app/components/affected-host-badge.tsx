"use client";

type Props = {
  count: number;
  onClick?: () => void;
  compact?: boolean;
};

export function AffectedHostBadge({ count, onClick, compact }: Props) {
  const content = <span style={{ color: "var(--text-muted)", fontSize: compact ? 11 : 12 }}>({count})</span>;
  const style: React.CSSProperties = {
    display: "inline",
    cursor: onClick ? "pointer" : "default",
    marginLeft: 4,
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{ ...style, background: "none", border: "none", padding: 0, font: "inherit" }}
        title="Manage affected hosts"
      >
        {content}
      </button>
    );
  }
  return <span style={style}>{content}</span>;
}

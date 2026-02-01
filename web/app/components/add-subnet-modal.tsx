"use client";

type Props = {
  onClose: () => void;
  onSubmit: (cidr: string, name: string) => Promise<void>;
};

export function AddSubnetModal({ onClose, onSubmit }: Props) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const cidr = (form.elements.namedItem("cidr") as HTMLInputElement).value.trim();
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    if (!cidr) return;
    await onSubmit(cidr, name || "");
    onClose();
  };

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
          maxWidth: 400,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Add subnet</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>CIDR (e.g. 10.0.0.0/24)</label>
            <input name="cidr" type="text" required placeholder="10.0.0.0/24" className="theme-input" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Name (optional)</label>
            <input name="name" type="text" placeholder="Internal LAN" className="theme-input" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="theme-btn theme-btn-primary">Add subnet</button>
          </div>
        </form>
      </div>
    </div>
  );
}

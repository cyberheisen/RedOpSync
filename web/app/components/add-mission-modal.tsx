"use client";

type Props = {
  error?: string;
  onClose: () => void;
  onSubmit: (name: string, description: string, startDate: string, endDate: string) => Promise<void>;
};

export function AddMissionModal({ error, onClose, onSubmit }: Props) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem("description") as HTMLInputElement).value.trim();
    const startDate = (form.elements.namedItem("start_date") as HTMLInputElement).value;
    const endDate = (form.elements.namedItem("end_date") as HTMLInputElement).value;
    if (!name) return;
    await onSubmit(name, description, startDate, endDate);
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Create mission</h2>
        {error && <p style={{ color: "var(--error)", fontSize: 14, marginBottom: 12 }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Name</label>
            <input name="name" type="text" required placeholder="e.g. Acme Corp engagement" className="theme-input" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Description (optional)</label>
            <input name="description" type="text" placeholder="Brief description" className="theme-input" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Start date (optional)</label>
            <input name="start_date" type="date" className="theme-input" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>End date (optional)</label>
            <input name="end_date" type="date" className="theme-input" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="theme-btn theme-btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

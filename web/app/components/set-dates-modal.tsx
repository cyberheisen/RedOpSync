"use client";

type Props = {
  missionName: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onSubmit: (startDate: string, endDate: string) => Promise<void>;
};

export function SetDatesModal({ missionName, startDate, endDate, onClose, onSubmit }: Props) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const start = (form.elements.namedItem("start_date") as HTMLInputElement).value;
    const end = (form.elements.namedItem("end_date") as HTMLInputElement).value;
    await onSubmit(start, end);
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Set dates — {missionName}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Start date</label>
            <input name="start_date" type="date" defaultValue={startDate} className="theme-input" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>End date</label>
            <input name="end_date" type="date" defaultValue={endDate} className="theme-input" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="theme-btn theme-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

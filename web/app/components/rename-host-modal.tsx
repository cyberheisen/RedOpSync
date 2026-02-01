"use client";

type Props = {
  hostIp: string;
  hostDnsName: string | null;
  onClose: () => void;
  onSubmit: (ip: string, dnsName: string) => Promise<void>;
};

export function RenameHostModal({ hostIp, hostDnsName, onClose, onSubmit }: Props) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const ip = (form.elements.namedItem("ip") as HTMLInputElement).value.trim();
    const dnsName = (form.elements.namedItem("dns_name") as HTMLInputElement).value.trim();
    if (!ip) return;
    await onSubmit(ip, dnsName);
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Rename host</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>IP</label>
            <input name="ip" type="text" required defaultValue={hostIp} className="theme-input" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>DNS name (optional)</label>
            <input name="dns_name" type="text" defaultValue={hostDnsName ?? ""} className="theme-input" />
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

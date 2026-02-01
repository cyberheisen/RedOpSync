"use client";

type Subnet = { id: string; cidr: string; name: string | null };

type Props = {
  subnetId: string | null;
  subnets: Subnet[];
  onClose: () => void;
  onSubmit: (ip: string, dnsName: string, subnetId: string | null) => Promise<void>;
};

export function AddHostModal({ subnetId, subnets, onClose, onSubmit }: Props) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const ip = (form.elements.namedItem("ip") as HTMLInputElement).value.trim();
    const dnsName = (form.elements.namedItem("dns_name") as HTMLInputElement).value.trim();
    const subId = (form.elements.namedItem("subnet_id") as HTMLSelectElement).value || null;
    if (!ip) return;
    await onSubmit(ip, dnsName, subId);
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
        <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Add host</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>IP</label>
            <input name="ip" type="text" required placeholder="10.0.0.1" className="theme-input" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>DNS name (optional)</label>
            <input name="dns_name" type="text" placeholder="host.example.com" className="theme-input" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Subnet (optional)</label>
            <select name="subnet_id" className="theme-select" defaultValue={subnetId ?? ""}>
              <option value="">— None —</option>
              {subnets.map((s) => (
                <option key={s.id} value={s.id}>{s.cidr}{s.name ? ` (${s.name})` : ""}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="theme-btn theme-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="theme-btn theme-btn-primary">Add host</button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function getHealth() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    return await res.json();
  } catch {
    return { status: "unreachable" };
  }
}

export default async function Home() {
  const health = await getHealth();
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: 0 }}>RedOpSync</h1>
      <p style={{ marginTop: 8, color: "#444" }}>
        Starter scaffold UI. Tree navigation, locking, imports, and tool execution are not implemented yet.
      </p>
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ fontWeight: 600 }}>API Health</div>
        <pre style={{ margin: 0, marginTop: 8, overflowX: "auto" }}>{JSON.stringify(health, null, 2)}</pre>
      </div>
    </main>
  );
}

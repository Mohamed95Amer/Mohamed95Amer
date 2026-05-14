"use client";

import { useState } from "react";

export function AdminDocViewerClient({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const res = await fetch("/api/vendor/documents/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    setBusy(false);
    if (!res.ok) return;
    const j = await res.json();
    window.open(j.url, "_blank", "noopener,noreferrer");
  }
  return (
    <button className="btn-ghost text-xs" onClick={open} disabled={busy}>{busy ? "…" : "View"}</button>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StoreVisitActions({ visitId, status }: { visitId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(decision: "confirm" | "decline" | "complete") {
    setBusy(true); setError(null);
    const response = await fetch("/api/vendor/store-visits/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitId, decision }) });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(json.error ?? "Could not update visit"); return; }
    router.refresh();
  }
  return <div><div className="flex flex-wrap gap-2">{status === "requested" && <><button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => act("confirm")}>Confirm visit</button><button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => act("decline")}>Decline</button></>}{status === "confirmed" && <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => act("complete")}>Mark completed</button>}</div>{error && <p role="alert" className="mt-2 text-xs text-signal-err">{error}</p>}</div>;
}

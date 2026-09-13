"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const actions: Record<string, Array<[string, string]>> = {
  offered: [["accepted", "Accept assignment"], ["declined", "Decline"]],
  accepted: [["pickup_scheduled", "Pickup scheduled"]],
  pickup_scheduled: [["collected", "Collected from store"]],
  collected: [["out_for_delivery", "Out for delivery"], ["delivery_failed", "Report issue"]],
  out_for_delivery: [["delivered", "Mark delivered"], ["delivery_failed", "Delivery failed"]],
  delivery_failed: [["out_for_delivery", "Retry delivery"]],
};

export function DeliveryStatusActions({ assignmentId, status }: { assignmentId: string; status: string }) {
  const router = useRouter(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [note, setNote] = useState(""); const options = actions[status] ?? [];
  async function act(next: string) { setBusy(next); setError(null); const response = await fetch("/api/delivery/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId, status: next, publicNote: note || null, proofReference: next === "delivered" ? note || null : null }) }); setBusy(null); if (!response.ok) { const json = await response.json().catch(() => ({})); setError(json.error ?? "Could not update delivery"); return; } router.refresh(); }
  if (options.length === 0) return null;
  return <div className="mt-4"><label className="label" htmlFor={`delivery-note-${assignmentId}`}>Customer-visible update</label><input id={`delivery-note-${assignmentId}`} className="input mt-1" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note or delivery proof reference" /><div className="mt-3 flex flex-wrap gap-2">{options.map(([next, label]) => <button key={next} type="button" className={next === "declined" || next === "delivery_failed" ? "btn-ghost text-xs" : "btn-primary text-xs"} onClick={() => act(next)} disabled={Boolean(busy)}>{busy === next ? "Updating…" : label}</button>)}</div>{error && <p className="mt-2 text-xs text-signal-err">{error}</p>}</div>;
}


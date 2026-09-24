"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DELIVERY_ACTIONS } from "@/lib/delivery/transitions";

export function DeliveryStatusActions({ assignmentId, status }: { assignmentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState("");
  const options = DELIVERY_ACTIONS[status] ?? [];
  async function act(next: string) {
    if (next === "delivered" && !proof.trim()) {
      setError("Add a delivery proof reference before marking this order delivered.");
      return;
    }
    setBusy(next);
    setError(null);
    try {
      const response = await fetch("/api/delivery/assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, status: next, publicNote: note || null, proofReference: next === "delivered" ? proof.trim() : null }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.message ?? "Could not update delivery. Refresh and try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connection interrupted. Refresh to check the latest delivery status before retrying.");
    } finally {
      setBusy(null);
    }
  }
  if (options.length === 0) return null;
  return <div className="mt-4">
    <label className="label" htmlFor={`delivery-note-${assignmentId}`}>Customer-visible update</label>
    <input id={`delivery-note-${assignmentId}`} className="input mt-1" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional delivery update" />
    {status === "out_for_delivery" && <div className="mt-3">
      <label className="label" htmlFor={`delivery-proof-${assignmentId}`}>Delivery proof reference (required to complete)</label>
      <input id={`delivery-proof-${assignmentId}`} className="input mt-1" maxLength={500} value={proof} onChange={(event) => setProof(event.target.value)} aria-describedby={`delivery-proof-help-${assignmentId}`} placeholder="Courier proof-of-delivery reference" />
      <p id={`delivery-proof-help-${assignmentId}`} className="mt-1 text-xs text-ink-muted">Enter the courier’s receipt reference, not an identity document number or a customer’s OTP.</p>
    </div>}
    <div className="mt-3 flex flex-wrap gap-2">{options.map(([next, label]) => <button key={next} type="button" className={next === "declined" || next === "delivery_failed" ? "btn-ghost text-xs" : "btn-primary text-xs"} onClick={() => act(next)} disabled={Boolean(busy)}>{busy === next ? "Updating…" : label}</button>)}</div>
    {error && <p role="alert" className="mt-2 text-xs text-signal-err">{error}</p>}
  </div>;
}

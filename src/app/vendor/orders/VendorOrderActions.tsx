"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VendorOrderActions({ reservationId, estimatedTotalAed, availableAt }: { reservationId: string; estimatedTotalAed: number; availableAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [finalTotal, setFinalTotal] = useState(estimatedTotalAed.toFixed(2));
  const queued = Date.parse(availableAt) > Date.now();

  async function act(decision: "confirm" | "reject") {
    setBusy(decision);
    setErr(null);
    const res = await fetch("/api/vendor/reservations/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, decision, ...(decision === "confirm" ? { finalTotalAed: Number(finalTotal) } : {}) }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Failed");
      return;
    }
    router.refresh();
  }

  if (queued) return <p className="max-w-52 text-right text-xs text-ink-muted">Queued until the store opens. Confirmation actions unlock automatically.</p>;

  return (
    <div className="flex min-w-56 flex-col items-end gap-2">
      <label className="w-full text-left"><span className="label">Final total (AED)</span><input className="input mt-1 text-right" type="number" min="0.01" max="100000000" step="0.01" value={finalTotal} onChange={(event) => setFinalTotal(event.target.value)} /></label>
      <p className="text-right text-[11px] leading-relaxed text-ink-muted">Confirm the exact current amount the customer will pay, including fees, VAT and delivery shown for this order.</p>
      <div className="flex justify-end gap-2">
      <button className="btn-ghost text-xs" disabled={busy !== null} onClick={() => act("reject")}>
        {busy === "reject" ? "…" : "Reject"}
      </button>
      <button className="btn-primary text-xs" disabled={busy !== null} onClick={() => act("confirm")}>
        {busy === "confirm" ? "…" : "Confirm"}
      </button>
      {err && <span className="text-xs text-signal-err ml-2">{err}</span>}
      </div>
    </div>
  );
}

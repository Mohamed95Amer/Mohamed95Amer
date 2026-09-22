"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DisputeAction = "report" | "resolve" | "clear";

export function AdminPaymentDisputeActions({ reservationId, status }: { reservationId: string; status: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: DisputeAction) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/orders/payment-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, action, note: note || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not update the payment dispute.");
        return;
      }
      setEditing(false);
      setNote("");
      router.refresh();
    } catch {
      setError("Connection failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-2">
        {status !== "reported" && <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setEditing(true)}>Flag payment dispute</button>}
        {status === "reported" && <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => setEditing(true)}>Resolve dispute</button>}
        {status !== "none" && <button type="button" className="btn-secondary px-3 py-2 text-xs" disabled={busy} onClick={() => submit("clear")}>Clear marker</button>}
        {error && <p className="w-full text-xs text-signal-err">{error}</p>}
      </div>
    );
  }

  const action: DisputeAction = status === "reported" ? "resolve" : "report";
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label">{action === "report" ? "Reason for dispute" : "Resolution note"}</span>
        <textarea className="input mt-1 min-h-24" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={action === "report" ? "For example: vendor cannot match the transaction reference." : "Record how the issue was resolved."} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-primary px-3 py-2 text-xs" disabled={busy} onClick={() => submit(action)}>{busy ? "Saving…" : action === "report" ? "Flag dispute" : "Mark resolved"}</button>
        <button type="button" className="btn-secondary px-3 py-2 text-xs" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
      </div>
      {error && <p className="text-xs text-signal-err">{error}</p>}
    </div>
  );
}

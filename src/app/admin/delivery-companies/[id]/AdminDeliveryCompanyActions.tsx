"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminDeliveryCompanyActions({ deliveryCompanyId, currentStatus }: { deliveryCompanyId: string; currentStatus: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "suspend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(decision: "approve" | "reject" | "suspend") {
    setBusy(decision);
    setError(null);
    const response = await fetch("/api/admin/delivery-companies/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryCompanyId, decision, note: note || null }) });
    const result = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Could not update this company."); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div><label htmlFor="delivery-admin-note" className="label">Admin note (optional)</label><textarea id="delivery-admin-note" name="admin_note" className="input min-h-24" value={note} onChange={(event) => setNote(event.target.value)} /></div>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy !== null} onClick={() => act("approve")}>{busy === "approve" ? "…" : "Approve"}</button><button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? "…" : "Reject"}</button><button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => act("suspend")}>{busy === "suspend" ? "…" : "Suspend"}</button><span className="self-center text-xs text-ink-muted">Current: {currentStatus}</span></div>
      {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
    </div>
  );
}

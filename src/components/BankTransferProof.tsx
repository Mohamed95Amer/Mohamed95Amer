"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function BankTransferProof({ reservationId, submitted }: { reservationId: string; submitted: boolean }) {
  const router = useRouter(); const [busy,setBusy] = useState(false); const [message,setMessage] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); form.set("reservationId", reservationId); setBusy(true);
    try { const response = await fetch("/api/reservations/bank-proof", { method: "POST", body: form }); const body = await response.json(); setMessage(response.ok ? "Proof submitted. Waiting for the store to verify receipt of funds." : body.error); if (response.ok) router.refresh(); }
    catch { setMessage("Connection failed. Check the order before retrying."); } finally { setBusy(false); }
  }
  if (submitted) return <p className="mt-4 text-sm">Payment marked as sent — waiting for the store to check its own account.</p>;
  return <form className="mt-4 space-y-3" onSubmit={upload}><label className="block"><span className="label">Transaction reference (optional)</span><input name="reference" className="input" maxLength={120} /></label><label className="block"><span className="label">Payment screenshot (optional, PDF, PNG or JPEG; maximum 5 MB)</span><input name="proof" type="file" accept="application/pdf,image/png,image/jpeg" className="mt-2 block w-full text-sm" /></label><p className="text-xs text-ink-muted">A screenshot helps the store locate the transfer but never confirms payment. Hide your balance and unrelated transactions. Never upload passwords, OTPs or identity documents.</p><button disabled={busy} className="btn-primary">{busy ? "Submitting…" : "I have paid"}</button><p role="status" className="text-sm">{message}</p></form>;
}

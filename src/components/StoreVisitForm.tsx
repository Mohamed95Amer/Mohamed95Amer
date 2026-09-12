"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function StoreVisitForm({ productId, defaultPhone = "" }: { productId: string; defaultPhone?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const date = new Date(String(form.get("preferredAt")));
    const response = await fetch("/api/store-visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, preferredAt: date.toISOString(), phone: form.get("phone"), note: form.get("note") || null }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (response.status === 401) { router.push(`/login?next=/products/${productId}`); return; }
    if (!response.ok) { setMessage(json.error ?? "Could not request visit"); return; }
    setMessage("Visit requested. The store will confirm the time."); setOpen(false); router.refresh();
  }

  if (!open) return <div><button type="button" className="btn-ghost w-full" onClick={() => setOpen(true)}>Request a store visit</button>{message && <p className="mt-2 text-xs text-signal-ok" role="status">{message}</p>}<p className="mt-2 text-xs leading-relaxed text-ink-muted">No identity check, payment, stock hold or price lock. This only asks the store to confirm a visit.</p></div>;
  return <form className="grid gap-3 rounded-2xl border border-jade-900/10 bg-jade-50 p-4" onSubmit={submit}><p className="text-sm font-semibold text-jade-950">Request a store visit</p><div><label className="label" htmlFor="visit-time">Preferred date and time</label><input id="visit-time" name="preferredAt" className="input" type="datetime-local" min={minimumTime()} required /></div><div><label className="label" htmlFor="visit-phone">Mobile number</label><input id="visit-phone" name="phone" className="input" type="tel" minLength={7} maxLength={20} defaultValue={defaultPhone} required /></div><div><label className="label" htmlFor="visit-note">Note (optional)</label><textarea id="visit-note" name="note" className="input min-h-20" maxLength={500} /></div>{message && <p className="text-xs text-signal-err" role="alert">{message}</p>}<div className="flex gap-2"><button className="btn-primary px-4 py-2 text-xs" disabled={busy}>{busy ? "Sending…" : "Send visit request"}</button><button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={() => setOpen(false)}>Cancel</button></div></form>;
}

function minimumTime() {
  const value = new Date(Date.now() + 60 * 60_000);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

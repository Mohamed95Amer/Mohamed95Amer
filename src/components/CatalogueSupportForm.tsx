"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CatalogueSupportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/vendor/catalogue-support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetListingCount: Number(form.get("count")), notes: form.get("notes") || null }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(json.error === "active_request_exists" ? "You already have an active onboarding request." : json.error ?? "Could not request support"); return; }
    router.refresh();
  }
  return <form className="card mt-6 grid gap-4 p-6" onSubmit={submit}><div><label className="label" htmlFor="catalogue-count">How many launch listings?</label><select id="catalogue-count" name="count" className="input" defaultValue="15">{[10, 15, 20].map((count) => <option key={count} value={count}>{count} products</option>)}</select></div><div><label className="label" htmlFor="catalogue-notes">What help do you need?</label><textarea id="catalogue-notes" name="notes" className="input min-h-28" maxLength={1000} placeholder="Photography, pricing entry, certificates, spreadsheet import, or a store visit." /></div>{error && <p role="alert" className="text-sm text-signal-err">{error}</p>}<button className="btn-primary" disabled={busy}>{busy ? "Requesting…" : "Request free launch setup"}</button></form>;
}

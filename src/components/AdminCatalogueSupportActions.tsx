"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminCatalogueSupportActions({ requestId, currentStatus, initialNote }: { requestId: string; currentStatus: string; initialNote?: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    const response = await fetch("/api/admin/catalogue-support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, status, adminNote: note || null }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(json.error ?? "Could not update"); return; }
    router.refresh();
  }
  return <div className="mt-3 grid gap-2"><select className="input" aria-label="Onboarding status" value={status} onChange={(event) => setStatus(event.target.value)}>{["requested", "scheduled", "in_progress", "completed", "cancelled"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><textarea className="input min-h-20" aria-label="Admin onboarding note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Appointment, assigned person or next step" /><button className="btn-primary px-4 py-2 text-xs" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>{error && <p className="text-xs text-signal-err">{error}</p>}</div>;
}

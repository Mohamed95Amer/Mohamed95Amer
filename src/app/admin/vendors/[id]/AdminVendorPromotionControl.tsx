"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PromotionRow { id: string; label: string; reward_reason: string; starts_at: string; ends_at: string; cancelled_at: string | null; admin_note: string | null }

export function AdminVendorPromotionControl({ vendorId, promotions }: { vendorId: string; promotions: PromotionRow[] }) {
  const router = useRouter();
  const [durationDays, setDurationDays] = useState(14);
  const [label, setLabel] = useState("Premium vendor");
  const [reason, setReason] = useState("referral_reward");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    const response = await fetch("/api/admin/vendor-promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId, durationDays, label, rewardReason: reason, adminNote: note || null }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(typeof body.error === "string" ? body.error : "Could not activate premium placement");
    setNote(""); router.refresh();
  }

  async function cancel(id: string) {
    setBusy(true); setError(null);
    const response = await fetch("/api/admin/vendor-promotions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(typeof body.error === "string" ? body.error : "Could not cancel placement");
    router.refresh();
  }

  const now = Date.now();
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="premium-label">Public label</label><input id="premium-label" className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <div><label className="label" htmlFor="premium-days">Reward duration (days)</label><input id="premium-days" className="input" type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} /></div>
      <div><label className="label" htmlFor="premium-reason">Reason</label><select id="premium-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="referral_reward">Vendor referral reward</option><option value="launch_reward">Launch reward</option><option value="performance_reward">Performance reward</option><option value="commercial">Commercial placement</option><option value="other">Other</option></select></div>
      <div><label className="label" htmlFor="premium-note">Private admin note</label><input id="premium-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this reward was granted" /></div>
    </div>
    <button className="btn-primary" type="button" disabled={busy} onClick={create}>{busy ? "Saving…" : "Grant premium placement"}</button>
    {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-jade-900/10">
      <table className="min-w-[650px] w-full text-sm"><thead className="bg-bone-soft text-ink-muted"><tr><th className="px-3 py-2 text-left">Placement</th><th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Dates</th><th className="px-3 py-2 text-left">Status</th><th /></tr></thead><tbody>
        {promotions.map((item) => { const active = !item.cancelled_at && Date.parse(item.starts_at) <= now && Date.parse(item.ends_at) > now; const upcoming = !item.cancelled_at && Date.parse(item.starts_at) > now; return <tr key={item.id} className="border-t border-bone-deep"><td className="px-3 py-2 font-medium">{item.label}</td><td className="px-3 py-2">{item.reward_reason.replaceAll("_", " ")}</td><td className="px-3 py-2 text-xs">{formatDate(item.starts_at)} → {formatDate(item.ends_at)}</td><td className="px-3 py-2">{item.cancelled_at ? "Cancelled" : active ? "Active" : upcoming ? "Scheduled" : "Ended"}</td><td className="px-3 py-2 text-right">{(active || upcoming) && <button type="button" className="text-xs font-semibold text-signal-err underline" disabled={busy} onClick={() => cancel(item.id)}>Cancel</button>}</td></tr>; })}
        {promotions.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-ink-muted">No premium placement history.</td></tr>}
      </tbody></table>
    </div>
  </div>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }

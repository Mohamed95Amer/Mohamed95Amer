"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Settings {
  platform_fee_bps: number;
  delivery_fee_aed: number;
  reservation_lock_minutes: number;
  stale_price_seconds: number;
  listing_fresh_days: number;
  online_payments_enabled: boolean;
  online_payment_provider: string | null;
}

export function AdminSettingsForm({ initial }: { initial: Settings | null }) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>({
    platform_fee_bps: initial?.platform_fee_bps ?? 100,
    delivery_fee_aed: initial?.delivery_fee_aed ?? 0,
    reservation_lock_minutes: initial?.reservation_lock_minutes ?? 10,
    stale_price_seconds: initial?.stale_price_seconds ?? 60,
    listing_fresh_days: initial?.listing_fresh_days ?? 45,
    online_payments_enabled: false,
    online_payment_provider: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setOk(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform_fee_bps: Number(form.platform_fee_bps),
        delivery_fee_aed: Number(form.delivery_fee_aed),
        reservation_lock_minutes: Number(form.reservation_lock_minutes),
        stale_price_seconds: Number(form.stale_price_seconds),
        listing_fresh_days: Number(form.listing_fresh_days),
        online_payments_enabled: Boolean(form.online_payments_enabled),
        online_payment_provider: form.online_payment_provider || null,
      }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(()=>({})); setErr(typeof j.error === "string" ? j.error : "Failed"); return; }
    setOk(true);
    router.refresh();
  }

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <form className="grid gap-4" onSubmit={save}>
      <div>
        <label className="label" htmlFor="setting-commission">Phase 1 fee model</label>
        <input id="setting-commission" className="input" value="1% customer fee · first 3 orders at 0.5%" readOnly />
        <p className="mt-1 text-xs text-ink-muted">
          The first three active or completed orders reserve a 50%-off fee slot. Rejected, cancelled and expired orders release their slots. Vendor making-charge commission is paused.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="setting-delivery">Delivery fee per order (AED)</label>
        <input id="setting-delivery" name="delivery_fee_aed" className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.delivery_fee_aed}
          onChange={(e) => set("delivery_fee_aed", Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="setting-lock">Reservation lock (minutes)</label>
        <input id="setting-lock" name="reservation_lock_minutes" className="input" type="number" inputMode="numeric" min="1" max="60" step="1" value={form.reservation_lock_minutes}
          onChange={(e) => set("reservation_lock_minutes", Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="setting-stale">Stale price threshold (seconds)</label>
        <input id="setting-stale" name="stale_price_seconds" className="input" type="number" inputMode="numeric" min="15" max="600" step="1" value={form.stale_price_seconds}
          onChange={(e) => set("stale_price_seconds", Number(e.target.value))} />
        <p className="text-xs text-ink-muted mt-1">If the latest tick is older than this, reservation is disabled marketplace-wide.</p>
      </div>
      <div>
        <label className="label" htmlFor="setting-listing-freshness">Hide listings after (days without stock confirmation)</label>
        <input id="setting-listing-freshness" className="input" type="number" min="7" max="180" step="1" value={form.listing_fresh_days} onChange={(e) => set("listing_fresh_days", Number(e.target.value))} />
      </div>
      <div className="rounded-xl border border-jade-900/10 bg-jade-50 p-4">
        <label className="flex items-start gap-3 text-sm font-semibold text-jade-950">
          <input type="checkbox" className="mt-1" checked={false} disabled />
          Online checkout — provider connection required
        </label>
        <p className="mt-1 text-xs text-ink-muted">The choice remains visible to customers as coming soon. Activation stays locked until a contracted provider, signed webhooks, refunds and marketplace settlement are deployed and tested.</p>
        <label className="label mt-3" htmlFor="setting-payment-provider">Provider name</label>
        <input id="setting-payment-provider" className="input" maxLength={80} placeholder="Not connected" value="" disabled />
      </div>
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
      {ok && <p role="status" className="text-sm text-signal-ok">Saved.</p>}
      <div><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}

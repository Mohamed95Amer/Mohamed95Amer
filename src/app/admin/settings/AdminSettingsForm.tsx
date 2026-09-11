"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Settings {
  platform_fee_bps: number;
  delivery_fee_aed: number;
  reservation_lock_minutes: number;
  stale_price_seconds: number;
}

export function AdminSettingsForm({ initial }: { initial: Settings | null }) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>({
    platform_fee_bps: initial?.platform_fee_bps ?? 50,
    delivery_fee_aed: initial?.delivery_fee_aed ?? 0,
    reservation_lock_minutes: initial?.reservation_lock_minutes ?? 10,
    stale_price_seconds: initial?.stale_price_seconds ?? 60,
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
        <label className="label" htmlFor="setting-commission">Get Gold commission (%)</label>
        <input id="setting-commission" name="platform_fee_percent" className="input" type="number" inputMode="decimal" min="0" max="10" step="0.05" value={form.platform_fee_bps / 100}
          onChange={(e) => set("platform_fee_bps", Math.round(Number(e.target.value) * 100))} />
        <p className="mt-1 text-xs text-ink-muted">
          Launch rate: 0.5% of gold, making, stones and vendor premium. Delivery is excluded.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="setting-delivery">Delivery fee (AED)</label>
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
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
      {ok && <p role="status" className="text-sm text-signal-ok">Saved.</p>}
      <div><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}

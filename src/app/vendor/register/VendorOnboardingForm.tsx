"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMIRATES = [
  "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah",
] as const;

interface InitialVendor {
  business_name?: string;
  trade_license_number?: string;
  license_expiry_date?: string;
  owner_name?: string;
  email?: string;
  phone?: string;
  emirate?: string;
  store_address?: string;
  google_maps_link?: string | null;
  vat_trn_number?: string | null;
}

export function VendorOnboardingForm({ initial }: { initial: InitialVendor | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: initial?.business_name ?? "",
    trade_license_number: initial?.trade_license_number ?? "",
    license_expiry_date: initial?.license_expiry_date ?? "",
    owner_name: initial?.owner_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    emirate: initial?.emirate ?? "Dubai",
    store_address: initial?.store_address ?? "",
    google_maps_link: initial?.google_maps_link ?? "",
    vat_trn_number: initial?.vat_trn_number ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function set<K extends keyof typeof form>(key: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(false);
    const res = await fetch("/api/vendor/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        google_maps_link: form.google_maps_link || null,
        vat_trn_number: form.vat_trn_number || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Could not submit");
      return;
    }
    setOk(true);
    router.push("/vendor");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Business name</label>
        <input className="input" required value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
      </div>
      <div>
        <label className="label">Trade license number</label>
        <input className="input" required value={form.trade_license_number} onChange={(e) => set("trade_license_number", e.target.value)} />
      </div>
      <div>
        <label className="label">License expiry</label>
        <input className="input" type="date" required value={form.license_expiry_date} onChange={(e) => set("license_expiry_date", e.target.value)} />
      </div>
      <div>
        <label className="label">Owner name</label>
        <input className="input" required value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>
      <div>
        <label className="label">Emirate</label>
        <select className="input" value={form.emirate} onChange={(e) => set("emirate", e.target.value)}>
          {EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label">Store address</label>
        <textarea className="input min-h-[80px]" required value={form.store_address} onChange={(e) => set("store_address", e.target.value)} />
      </div>
      <div>
        <label className="label">Google Maps link (optional)</label>
        <input className="input" value={form.google_maps_link} onChange={(e) => set("google_maps_link", e.target.value)} />
      </div>
      <div>
        <label className="label">VAT / TRN (optional)</label>
        <input className="input" value={form.vat_trn_number} onChange={(e) => set("vat_trn_number", e.target.value)} />
      </div>
      {err && <p className="md:col-span-2 text-sm text-signal-err">{err}</p>}
      {ok && <p className="md:col-span-2 text-sm text-signal-ok">Application submitted.</p>}
      <div className="md:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
      </div>
    </form>
  );
}

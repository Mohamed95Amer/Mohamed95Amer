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
        <label className="label" htmlFor="vendor-business-name">Business name</label>
        <input id="vendor-business-name" name="business_name" className="input" required autoComplete="organization" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-license">Trade licence number</label>
        <input id="vendor-license" name="trade_license_number" className="input" required value={form.trade_license_number} onChange={(e) => set("trade_license_number", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-license-expiry">Licence expiry</label>
        <input id="vendor-license-expiry" name="license_expiry_date" className="input" type="date" required value={form.license_expiry_date} onChange={(e) => set("license_expiry_date", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-owner">Owner name</label>
        <input id="vendor-owner" name="owner_name" className="input" required autoComplete="name" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-email">Business email</label>
        <input id="vendor-email" name="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-phone">Business phone</label>
        <input id="vendor-phone" name="phone" className="input" type="tel" required autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-emirate">Emirate</label>
        <select id="vendor-emirate" name="emirate" className="input" value={form.emirate} onChange={(e) => set("emirate", e.target.value)}>
          {EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="vendor-address">Store address</label>
        <textarea id="vendor-address" name="store_address" className="input min-h-[80px]" required autoComplete="street-address" value={form.store_address} onChange={(e) => set("store_address", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-map">Google Maps link (optional)</label>
        <input id="vendor-map" name="google_maps_link" className="input" type="url" inputMode="url" value={form.google_maps_link} onChange={(e) => set("google_maps_link", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="vendor-trn">VAT / TRN (optional)</label>
        <input id="vendor-trn" name="vat_trn_number" className="input" value={form.vat_trn_number} onChange={(e) => set("vat_trn_number", e.target.value)} />
      </div>
      {err && <p role="alert" className="md:col-span-2 text-sm text-signal-err">{err}</p>}
      {ok && <p role="status" className="md:col-span-2 text-sm text-signal-ok">Application submitted.</p>}
      <div className="md:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
      </div>
    </form>
  );
}

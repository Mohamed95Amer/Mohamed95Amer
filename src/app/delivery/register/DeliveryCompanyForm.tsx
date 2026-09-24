"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"] as const;

interface InitialCompany {
  company_name?: string;
  trade_license_number?: string;
  license_expiry_date?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  emirates_served?: string[];
  service_notes?: string | null;
  website?: string | null;
}

export function DeliveryCompanyForm({ initial }: { initial: InitialCompany | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    company_name: initial?.company_name ?? "",
    trade_license_number: initial?.trade_license_number ?? "",
    license_expiry_date: initial?.license_expiry_date ?? "",
    contact_name: initial?.contact_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    emirates_served: initial?.emirates_served ?? ["Dubai"],
    service_notes: initial?.service_notes ?? "",
    website: initial?.website ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleEmirate(emirate: string) {
    set("emirates_served", form.emirates_served.includes(emirate)
      ? form.emirates_served.filter((item) => item !== emirate)
      : [...form.emirates_served, emirate]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/delivery-company/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, service_notes: form.service_notes || null, website: form.website || null }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(typeof result.error === "string" ? result.error : "Could not submit the company profile.");
      return;
    }
    router.push("/delivery");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><label htmlFor="delivery-company-name" className="label">Company name</label><input id="delivery-company-name" name="company_name" className="input" required autoComplete="organization" value={form.company_name} onChange={(event) => set("company_name", event.target.value)} /></div>
      <div><label htmlFor="delivery-license" className="label">Trade licence number</label><input id="delivery-license" name="trade_license_number" className="input" required value={form.trade_license_number} onChange={(event) => set("trade_license_number", event.target.value)} /></div>
      <div><label htmlFor="delivery-license-expiry" className="label">Licence expiry</label><input id="delivery-license-expiry" name="license_expiry_date" type="date" className="input" required value={form.license_expiry_date} onChange={(event) => set("license_expiry_date", event.target.value)} /></div>
      <div><label htmlFor="delivery-contact" className="label">Primary contact</label><input id="delivery-contact" name="contact_name" className="input" required autoComplete="name" value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} /></div>
      <div><label htmlFor="delivery-email" className="label">Operations email</label><input id="delivery-email" name="email" type="email" className="input" required autoComplete="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></div>
      <div><label htmlFor="delivery-phone" className="label">Operations phone</label><input id="delivery-phone" name="phone" type="tel" inputMode="tel" className="input" required autoComplete="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></div>
      <div><label htmlFor="delivery-website" className="label">Website (optional)</label><input id="delivery-website" name="website" type="url" inputMode="url" className="input" placeholder="https://" value={form.website} onChange={(event) => set("website", event.target.value)} /></div>
      <fieldset className="md:col-span-2">
        <legend className="label">Emirates served</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EMIRATES.map((emirate) => <label key={emirate} className="flex min-h-11 items-center gap-3 rounded-xl border border-jade-900/10 bg-white px-3 text-sm"><input type="checkbox" checked={form.emirates_served.includes(emirate)} onChange={() => toggleEmirate(emirate)} />{emirate}</label>)}
        </div>
      </fieldset>
      <div className="md:col-span-2"><label htmlFor="delivery-notes" className="label">Service capabilities (optional)</label><textarea id="delivery-notes" name="service_notes" className="input min-h-28" maxLength={1000} placeholder="Secure transport, insured handling, same-day emirates, operating hours…" value={form.service_notes} onChange={(event) => set("service_notes", event.target.value)} /></div>
      {error && <p role="alert" className="md:col-span-2 text-sm text-signal-err">{error}</p>}
      <div className="md:col-span-2"><button type="submit" className="btn-primary" disabled={busy || form.emirates_served.length === 0}>{busy ? "Submitting…" : "Submit company profile"}</button></div>
    </form>
  );
}

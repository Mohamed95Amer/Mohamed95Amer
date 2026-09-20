"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const EMIRATES = [
  "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah",
] as const;

interface InitialVendor {
  business_name?: string;
  trade_license_number?: string;
  license_expiry_date?: string;
  owner_name?: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_title?: string | null;
  email?: string;
  phone?: string;
  emirate?: string;
  store_address?: string;
  google_maps_link?: string | null;
  vat_trn_number?: string | null;
  number_of_stores?: number | null;
  delivery_available?: boolean | null;
  online_payment_available?: boolean | null;
  website_available?: boolean | null;
  website_url?: string | null;
}

type DocumentChoice = "trade_license" | "emirates_id";

function splitOwnerName(ownerName?: string) {
  const parts = (ownerName ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export function VendorOnboardingForm({ initial }: { initial: InitialVendor | null }) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const fallbackName = splitOwnerName(initial?.owner_name);
  const [form, setForm] = useState({
    business_name: initial?.business_name ?? "",
    trade_license_number: initial?.trade_license_number ?? "",
    license_expiry_date: initial?.license_expiry_date ?? "",
    contact_first_name: initial?.contact_first_name ?? fallbackName.first,
    contact_last_name: initial?.contact_last_name ?? fallbackName.last,
    contact_title: initial?.contact_title ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    emirate: initial?.emirate ?? "Dubai",
    store_address: initial?.store_address ?? "",
    google_maps_link: initial?.google_maps_link ?? "",
    vat_trn_number: initial?.vat_trn_number ?? "",
    number_of_stores: initial?.number_of_stores ?? 1,
    delivery_available: initial?.delivery_available ?? false,
    online_payment_available: initial?.online_payment_available ?? false,
    website_available: initial?.website_available ?? false,
    website_url: initial?.website_url ?? "",
  });
  const [files, setFiles] = useState<Record<DocumentChoice, File | null>>({ trade_license: null, emirates_id: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseFile(type: DocumentChoice, file: File | null) {
    if (file && file.size > 10 * 1024 * 1024) {
      setErr("Each optional document must be 10 MB or smaller.");
      return;
    }
    setErr(null);
    setFiles((current) => ({ ...current, [type]: file }));
  }

  async function uploadDocument(vendorId: string, type: DocumentChoice, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${vendorId}/${type}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from("vendor-docs").upload(path, file, { upsert: false, cacheControl: "3600" });
    if (uploadError) throw new Error(`${type === "trade_license" ? "Trade licence" : "Emirates ID"}: ${uploadError.message}`);
    const response = await fetch("/api/vendor/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_id: vendorId, doc_type: type, storage_path: path, original_filename: file.name, mime_type: file.type, size_bytes: file.size }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(typeof payload.error === "string" ? payload.error : "Could not record the uploaded document");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErr(null);
    setUploadNote(null);
    setOk(false);
    try {
      const response = await fetch("/api/vendor/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          owner_name: `${form.contact_first_name} ${form.contact_last_name}`.trim(),
          google_maps_link: form.google_maps_link || null,
          vat_trn_number: form.vat_trn_number || null,
          website_url: form.website_available ? form.website_url || null : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fieldErrors = payload?.details?.fieldErrors && typeof payload.details.fieldErrors === "object"
          ? Object.values(payload.details.fieldErrors).flat().map(String).join(" ")
          : "";
        setErr(fieldErrors || (typeof payload.error === "string" ? payload.error : "Could not submit"));
        return;
      }

      const uploadErrors: string[] = [];
      for (const [type, file] of Object.entries(files) as [DocumentChoice, File | null][]) {
        if (!file) continue;
        try {
          await uploadDocument(payload.vendorId, type, file);
        } catch (error) {
          uploadErrors.push(error instanceof Error ? error.message : "One document could not be uploaded");
        }
      }
      setOk(true);
      if (uploadErrors.length > 0) setUploadNote(`${uploadErrors.join(" ")} You can upload it later from Documents.`);
      router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not connect. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section>
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">01 · Contact person</p><h2 className="mt-1 font-serif text-2xl text-jade-950">Who should we speak with?</h2></div><span className="hidden text-xs text-ink-muted sm:block">Required fields marked *</span></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" id="vendor-first-name" required><input id="vendor-first-name" name="contact_first_name" className="input" required autoComplete="given-name" value={form.contact_first_name} onChange={(event) => set("contact_first_name", event.target.value)} /></Field>
          <Field label="Last name" id="vendor-last-name" required><input id="vendor-last-name" name="contact_last_name" className="input" required autoComplete="family-name" value={form.contact_last_name} onChange={(event) => set("contact_last_name", event.target.value)} /></Field>
          <Field label="Your title" id="vendor-title" hint="For example, owner or store manager" required><input id="vendor-title" name="contact_title" className="input" required autoComplete="organization-title" value={form.contact_title} onChange={(event) => set("contact_title", event.target.value)} /></Field>
          <Field label="Phone number" id="vendor-phone" required><input id="vendor-phone" name="phone" className="input" type="tel" required autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
          <Field label="Email address" id="vendor-email" required><input id="vendor-email" name="email" className="input" type="email" required autoComplete="email" inputMode="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
        </div>
      </section>

      <section className="border-t border-bone-deep pt-8">
        <div className="mb-4"><p className="eyebrow text-jade-600">02 · Business profile</p><h2 className="mt-1 font-serif text-2xl text-jade-950">Tell us about the store</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Official store name" id="vendor-business-name" hint="Use the name shown on your trade licence" required><input id="vendor-business-name" name="business_name" className="input" required autoComplete="organization" value={form.business_name} onChange={(event) => set("business_name", event.target.value)} /></Field></div>
          <Field label="Trade licence number" id="vendor-license" required><input id="vendor-license" name="trade_license_number" className="input" required value={form.trade_license_number} onChange={(event) => set("trade_license_number", event.target.value)} /></Field>
          <Field label="Licence expiry date" id="vendor-license-expiry" hint="Used for annual verification" required><input id="vendor-license-expiry" name="license_expiry_date" className="input" type="date" required value={form.license_expiry_date} onChange={(event) => set("license_expiry_date", event.target.value)} /></Field>
          <Field label="Number of stores" id="vendor-store-count" required><input id="vendor-store-count" name="number_of_stores" className="input" type="number" min={1} max={1000} required value={form.number_of_stores} onChange={(event) => set("number_of_stores", Number(event.target.value))} /></Field>
          <Field label="Emirate" id="vendor-emirate" required><select id="vendor-emirate" name="emirate" className="input" value={form.emirate} onChange={(event) => set("emirate", event.target.value)}>{EMIRATES.map((emirate) => <option key={emirate} value={emirate}>{emirate}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="Main store address" id="vendor-address" required><textarea id="vendor-address" name="store_address" className="input min-h-[80px]" required autoComplete="street-address" value={form.store_address} onChange={(event) => set("store_address", event.target.value)} /></Field></div>
          <Field label="Store map link" id="vendor-map" hint="Optional Google Maps or Apple Maps link"><input id="vendor-map" name="google_maps_link" className="input" type="url" inputMode="url" placeholder="https://maps.google.com/..." value={form.google_maps_link} onChange={(event) => set("google_maps_link", event.target.value)} /></Field>
          <Field label="VAT / TRN number" id="vendor-trn" hint="Optional at this stage"><input id="vendor-trn" name="vat_trn_number" className="input" value={form.vat_trn_number} onChange={(event) => set("vat_trn_number", event.target.value)} /></Field>
        </div>
      </section>

      <section className="border-t border-bone-deep pt-8">
        <div className="mb-4"><p className="eyebrow text-jade-600">03 · Store capabilities</p><h2 className="mt-1 font-serif text-2xl text-jade-950">How can customers buy from you?</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">These answers help us show the right fulfilment and payment options on your listings.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <YesNoCard label="Do you offer delivery?" name="delivery_available" value={form.delivery_available} onChange={(value) => set("delivery_available", value)} />
          <YesNoCard label="Do you accept online payment?" name="online_payment_available" value={form.online_payment_available} onChange={(value) => set("online_payment_available", value)} />
          <YesNoCard label="Do you have a website?" name="website_available" value={form.website_available} onChange={(value) => set("website_available", value)} />
        </div>
        {form.website_available && <div className="mt-4"><Field label="Website link" id="vendor-website" hint="Required when you select Yes" required><input id="vendor-website" name="website_url" className="input" type="url" required placeholder="https://yourstore.ae" value={form.website_url} onChange={(event) => set("website_url", event.target.value)} /></Field></div>}
      </section>

      <section className="border-t border-bone-deep pt-8">
        <div className="mb-4"><p className="eyebrow text-jade-600">04 · Optional documents</p><h2 className="mt-1 font-serif text-2xl text-jade-950">Send evidence when you are ready</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">Trade licence and Emirates ID copies are optional for this first application. You can submit them now or upload them later from your vendor dashboard. Files are private and only shared with Get Gold compliance.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><DocumentInput id="vendor-trade-license-file" label="Trade licence copy" file={files.trade_license} onChange={(file) => chooseFile("trade_license", file)} /><DocumentInput id="vendor-emirates-id-file" label="Emirates ID copy" file={files.emirates_id} onChange={(file) => chooseFile("emirates_id", file)} /></div>
        <p className="mt-3 text-xs text-ink-muted">PDF, JPG or PNG · up to 10 MB each · optional</p>
      </section>

      {err && <p role="alert" className="rounded-xl border border-signal-err/20 bg-signal-err/5 p-3 text-sm text-signal-err">{err}</p>}
      {ok && <div role="status" className="rounded-xl border border-signal-ok/20 bg-signal-ok/5 p-4 text-sm text-signal-ok"><p className="font-semibold">Application saved and sent for review.</p><p className="mt-1">We will contact you using the details above. You can continue adding documents from <Link href="/vendor/documents" className="font-semibold underline">Documents</Link>.</p>{uploadNote && <p className="mt-2 text-signal-warn">{uploadNote}</p>}</div>}
      <div className="flex flex-col gap-3 border-t border-bone-deep pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-relaxed text-ink-muted">By submitting, you agree that Get Gold may contact you about onboarding and verify your business information.</p><button className="btn-primary min-h-12 px-6" disabled={busy}>{busy ? "Saving application…" : "Submit vendor application →"}</button></div>
    </form>
  );
}

function Field({ label, id, hint, required, children }: { label: string; id: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="label" htmlFor={id}>{label}{required && <span className="ml-1 text-gold-700">*</span>}</label>{children}{hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}</div>;
}

function YesNoCard({ label, name, value, onChange }: { label: string; name: string; value: boolean; onChange: (value: boolean) => void }) {
  return <fieldset className="rounded-2xl border border-jade-900/10 bg-bone-soft p-4"><legend className="label px-1">{label}</legend><div className="mt-3 grid grid-cols-2 gap-2">{[[true, "Yes"], [false, "No"]].map(([option, text]) => <label key={String(text)} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold transition ${value === option ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted hover:border-jade-700/40"}`}><input className="sr-only" type="radio" name={name} checked={value === option} onChange={() => onChange(Boolean(option))} />{text}</label>)}</div></fieldset>;
}

function DocumentInput({ id, label, file, onChange }: { id: string; label: string; file: File | null; onChange: (file: File | null) => void }) {
  return <label htmlFor={id} className="group flex min-h-28 cursor-pointer flex-col justify-center rounded-2xl border border-dashed border-jade-900/20 bg-bone-soft p-4 transition hover:border-jade-700 hover:bg-jade-50"><span className="text-sm font-semibold text-jade-950">{label}</span><span className="mt-1 text-xs text-ink-muted">{file ? file.name : "Choose a file (optional)"}</span><input id={id} name={id} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></label>;
}

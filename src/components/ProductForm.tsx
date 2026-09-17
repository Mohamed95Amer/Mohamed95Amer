"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImageUploader } from "./ProductImageUploader";
import { SUPPORTED_KARATS } from "@/lib/pricing/calc";

interface ProductInitial {
  id?: string;
  name?: string;
  description?: string | null;
  category?: string;
  karat?: number;
  weight_grams?: number;
  making_charge?: number;
  making_charge_discount_percent?: number;
  making_charge_offer_ends_at?: string | null;
  certificate_fee?: number;
  stone_value?: number;
  vendor_rate_adjustment_per_gram?: number;
  vat_rate_bps?: number;
  quantity?: number;
  certificate_number?: string | null;
  hallmark_info?: string | null;
  images?: string[];
}

const CATEGORIES = ["ring","necklace","bracelet","earring","bangle","chain","pendant","bar","coin","other"];

export function ProductForm({ initial, vendorId }: { initial?: ProductInitial; vendorId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    category: (initial?.category as string) ?? "ring",
    karat: initial?.karat ?? 22,
    weight_grams: initial?.weight_grams ?? 0,
    making_charge: initial?.making_charge ?? 0,
    making_charge_discount_percent: initial?.making_charge_discount_percent ?? 0,
    making_charge_offer_ends_at: toLocalDateTimeInput(initial?.making_charge_offer_ends_at),
    certificate_fee: initial?.certificate_fee ?? 0,
    stone_value: initial?.stone_value ?? 0,
    vendor_rate_adjustment_per_gram: initial?.vendor_rate_adjustment_per_gram ?? 0,
    vat_rate_bps: initial?.vat_rate_bps ?? 500,
    vat_choice_confirmed: false,
    quantity: initial?.quantity ?? 1,
    certificate_number: initial?.certificate_number ?? "",
    hallmark_info: initial?.hallmark_info ?? "",
  });
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "draft");
    setErr(null);
    setIssues([]);
    try {
      const res = await fetch("/api/vendor/products", {
        method: initial?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initial?.id,
          ...form,
          karat: Number(form.karat),
          weight_grams: Number(form.weight_grams),
          making_charge: Number(form.making_charge),
          making_charge_discount_percent: Number(form.making_charge_discount_percent),
          making_charge_offer_ends_at: form.making_charge_offer_ends_at
            ? new Date(form.making_charge_offer_ends_at).toISOString()
            : null,
          certificate_fee: Number(form.certificate_fee),
          stone_value: Number(form.stone_value),
          vendor_rate_adjustment_per_gram: Number(form.vendor_rate_adjustment_per_gram),
          vendor_premium: 0,
          vat_rate_bps: Number(form.vat_rate_bps),
          quantity: Number(form.quantity),
          certificate_number: form.certificate_number || null,
          hallmark_info: form.hallmark_info || null,
          images,
          submit_for_approval: submit,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const messages = Array.isArray(j.issues)
          ? j.issues.map((issue: { message?: unknown }) => String(issue.message ?? "Check the listing details"))
          : j.details?.fieldErrors ? Object.values(j.details.fieldErrors).flat().map(String) : [];
        setIssues(messages);
        setErr(j.error === "listing_integrity_failed" ? "Fix these catalogue checks before submission:" : typeof j.error === "string" ? j.error : "Could not save");
        return;
      }
      router.push("/vendor/products");
      router.refresh();
    } catch {
      setErr("Could not connect. Your changes are still here — please try saving again.");
    } finally {
      setBusy(null);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(false); }}>
      <div className="md:col-span-2">
        <label className="label" htmlFor="product-name">Name</label>
        <input id="product-name" name="name" className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="product-category">Category</label>
        <select id="product-category" name="category" className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="product-karat">Karat</label>
        <select id="product-karat" name="karat" className="input" value={form.karat} onChange={(e) => set("karat", Number(e.target.value))}>
          {SUPPORTED_KARATS.map((k) => <option key={k} value={k}>{k}K</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="product-weight">Weight (grams)</label>
        <input id="product-weight" name="weight_grams" className="input" type="number" inputMode="decimal" step="0.001" min="0" required value={form.weight_grams} onChange={(e) => set("weight_grams", Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="product-quantity">Quantity</label>
        <input id="product-quantity" name="quantity" className="input" type="number" inputMode="numeric" min="0" step="1" required value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="product-making">Making charge for this item (AED)</label>
        <input id="product-making" name="making_charge" className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.making_charge} onChange={(e) => set("making_charge", Number(e.target.value))} />
        <p className="mt-1 text-xs text-ink-muted">Set this listing&apos;s own charge. Other products in your store can use a different amount; use AED 0 when making does not apply.</p>
      </div>
      <div>
        <label className="label" htmlFor="product-making-discount">Making discount (%)</label>
        <input id="product-making-discount" name="making_charge_discount_percent" className="input" type="number" inputMode="numeric" min="0" max="100" step="1" value={form.making_charge_discount_percent} onChange={(e) => set("making_charge_discount_percent", Number(e.target.value))} />
        <p className="mt-1 text-xs text-ink-muted">Use 100% for a free-making offer. Gold value is never discounted.</p>
      </div>
      <div>
        <label className="label" htmlFor="product-offer-end">Making offer ends (optional)</label>
        <input id="product-offer-end" name="making_charge_offer_ends_at" className="input" type="datetime-local" value={form.making_charge_offer_ends_at} onChange={(e) => set("making_charge_offer_ends_at", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="product-certificate-fee">Certificate / assay fee (AED)</label>
        <input id="product-certificate-fee" name="certificate_fee" className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.certificate_fee} onChange={(e) => set("certificate_fee", Number(e.target.value))} />
        <p className="mt-1 text-xs text-ink-muted">For certified bullion or third-party grading. Keep making at AED 0 when it does not apply.</p>
      </div>
      <div>
        <label className="label" htmlFor="product-stone">Stone value (AED)</label>
        <input id="product-stone" name="stone_value" className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.stone_value} onChange={(e) => set("stone_value", Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="product-rate-adjustment">Store rate adjustment (AED per gram)</label>
        <input id="product-rate-adjustment" name="vendor_rate_adjustment_per_gram" className="input" type="number" inputMode="decimal" min="0" max="1000" step="0.01" value={form.vendor_rate_adjustment_per_gram} onChange={(e) => set("vendor_rate_adjustment_per_gram", Number(e.target.value))} />
        <p className="mt-1 text-xs text-ink-muted">Optional shop-specific uplift on the UAE karat rate. It is shown separately from making charge and never hidden in the gold price.</p>
      </div>
      <fieldset className="md:col-span-2 rounded-xl border border-jade-900/15 bg-bone-soft p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-jade-950">VAT for this product</legend>
        <label className="label" htmlFor="product-vat">Should VAT be charged?</label>
        <select id="product-vat" name="vat_rate_bps" className="input" value={form.vat_rate_bps} onChange={(e) => { set("vat_rate_bps", Number(e.target.value)); set("vat_choice_confirmed", false); }}>
          <option value={500}>Yes — add 5% VAT</option>
          <option value={0}>No — do not charge VAT</option>
        </select>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">Choose the correct tax treatment for this item, not a promotional discount. You are responsible for your VAT obligations and invoice. If unsure, check with your tax adviser.</p>
        {form.vat_rate_bps === 0 && <label className="mt-3 flex items-start gap-3 rounded-lg border border-gold-300 bg-gold-100/40 p-3 text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-jade-800" checked={form.vat_choice_confirmed} onChange={(e) => set("vat_choice_confirmed", e.target.checked)} />
          <span>I confirm that not charging VAT is appropriate for this product and my business. Selecting this does not establish a tax exemption.</span>
        </label>}
        {initial?.id && <p className="mt-2 text-xs text-ink-muted">Changing VAT removes an approved listing from sale until it is submitted and approved again.</p>}
      </fieldset>
      <div>
        <label className="label" htmlFor="product-certificate">Certificate #</label>
        <input id="product-certificate" name="certificate_number" className="input" value={form.certificate_number} onChange={(e) => set("certificate_number", e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="product-hallmark">Hallmark info</label>
        <input id="product-hallmark" name="hallmark_info" className="input" value={form.hallmark_info} onChange={(e) => set("hallmark_info", e.target.value)} />
      </div>
      {vendorId && (
        <div className="md:col-span-2">
          <ProductImageUploader vendorId={vendorId} value={images} onChange={setImages} />
        </div>
      )}
      <div className="md:col-span-2">
        <label className="label" htmlFor="product-description">Description</label>
        <textarea id="product-description" name="description" className="input min-h-[100px]" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      {err && (
        <div role="alert" className="md:col-span-2 rounded-xl border border-signal-err/20 bg-signal-err/5 p-4 text-sm text-signal-err">
          <p className="font-semibold">{err}</p>
          {issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
        </div>
      )}
      <div className="md:col-span-2 flex gap-3">
        <button type="submit" className="btn-ghost" disabled={busy !== null}>
          {busy === "draft" ? "Saving…" : "Save draft"}
        </button>
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => save(true)}>
          {busy === "submit" ? "Submitting…" : "Submit for admin approval"}
        </button>
      </div>
    </form>
  );
}

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

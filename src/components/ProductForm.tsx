"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImageUploader } from "./ProductImageUploader";

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
  vendor_premium?: number;
  quantity?: number;
  certificate_number?: string | null;
  hallmark_info?: string | null;
  images?: string[];
}

const CATEGORIES = ["ring","necklace","bracelet","earring","bangle","chain","pendant","bar","coin","other"];
const KARATS = [18, 21, 22, 24];

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
    vendor_premium: initial?.vendor_premium ?? 0,
    quantity: initial?.quantity ?? 1,
    certificate_number: initial?.certificate_number ?? "",
    hallmark_info: initial?.hallmark_info ?? "",
  });
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "draft");
    setErr(null);
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
        vendor_premium: Number(form.vendor_premium),
        quantity: Number(form.quantity),
        certificate_number: form.certificate_number || null,
        hallmark_info: form.hallmark_info || null,
        images,
        submit_for_approval: submit,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Could not save");
      return;
    }
    router.push("/vendor/products");
    router.refresh();
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
          {KARATS.map((k) => <option key={k} value={k}>{k}K</option>)}
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
        <label className="label" htmlFor="product-premium">Vendor premium (AED)</label>
        <input id="product-premium" name="vendor_premium" className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.vendor_premium} onChange={(e) => set("vendor_premium", Number(e.target.value))} />
      </div>
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
      {err && <p role="alert" className="md:col-span-2 text-sm text-signal-err">{err}</p>}
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

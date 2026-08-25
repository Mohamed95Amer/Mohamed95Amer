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
        <label className="label">Name</label>
        <input className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Karat</label>
        <select className="input" value={form.karat} onChange={(e) => set("karat", Number(e.target.value))}>
          {KARATS.map((k) => <option key={k} value={k}>{k}K</option>)}
        </select>
      </div>
      <div>
        <label className="label">Weight (grams)</label>
        <input className="input" type="number" step="0.001" min="0" required value={form.weight_grams} onChange={(e) => set("weight_grams", Number(e.target.value))} />
      </div>
      <div>
        <label className="label">Quantity</label>
        <input className="input" type="number" min="0" step="1" required value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
      </div>
      <div>
        <label className="label">Making charge (AED)</label>
        <input className="input" type="number" min="0" step="0.01" value={form.making_charge} onChange={(e) => set("making_charge", Number(e.target.value))} />
      </div>
      <div>
        <label className="label">Stone value (AED)</label>
        <input className="input" type="number" min="0" step="0.01" value={form.stone_value} onChange={(e) => set("stone_value", Number(e.target.value))} />
      </div>
      <div>
        <label className="label">Vendor premium (AED)</label>
        <input className="input" type="number" min="0" step="0.01" value={form.vendor_premium} onChange={(e) => set("vendor_premium", Number(e.target.value))} />
      </div>
      <div>
        <label className="label">Certificate #</label>
        <input className="input" value={form.certificate_number} onChange={(e) => set("certificate_number", e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <label className="label">Hallmark info</label>
        <input className="input" value={form.hallmark_info} onChange={(e) => set("hallmark_info", e.target.value)} />
      </div>
      {vendorId && (
        <div className="md:col-span-2">
          <ProductImageUploader vendorId={vendorId} value={images} onChange={setImages} />
        </div>
      )}
      <div className="md:col-span-2">
        <label className="label">Description</label>
        <textarea className="input min-h-[100px]" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      {err && <p className="md:col-span-2 text-sm text-signal-err">{err}</p>}
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

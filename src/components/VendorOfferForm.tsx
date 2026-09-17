"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function VendorOfferForm({ requestId, existing, products = [] }: { requestId: string; existing?: any; products?: Array<{ id: string; name: string; karat: number; weight_grams: number | string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/vendor/buyer-requests/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, productId: form.get("productId") || null, totalPriceAed: Number(form.get("total")), makingChargeAed: Number(form.get("making")), certificateFeeAed: Number(form.get("certificate")), estimatedDays: Number(form.get("days")), supportsDelivery: form.get("delivery") === "on", note: form.get("note") }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(json.error ?? "Could not submit offer"); return; }
    router.refresh();
  }
  return <form className="mt-4 grid gap-3 rounded-2xl border border-jade-900/10 bg-white p-4" onSubmit={submit}><div><label className="label" htmlFor={`offer-product-${requestId}`}>Link a ready listing (recommended)</label><select id={`offer-product-${requestId}`} name="productId" className="input" defaultValue={existing?.product_id ?? ""}><option value="">Custom item · continue with store</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.karat}K · {product.weight_grams}g</option>)}</select><p className="mt-1 text-[11px] text-ink-muted">A linked approved listing lets the buyer use the normal identity, stock-lock and checkout flow.</p></div><div className="grid grid-cols-2 gap-3"><Mini idPrefix={requestId} label="Indicative total (AED)" name="total" defaultValue={existing?.total_price_aed} /><Mini idPrefix={requestId} label="Making charge" name="making" defaultValue={existing?.making_charge_aed ?? 0} /><Mini idPrefix={requestId} label="Certificate fee" name="certificate" defaultValue={existing?.certificate_fee_aed ?? 0} /><Mini idPrefix={requestId} label="Ready in days" name="days" defaultValue={existing?.estimated_days ?? 3} /></div><label className="flex items-center gap-2 text-sm"><input name="delivery" type="checkbox" defaultChecked={existing?.supports_delivery ?? true} /> Delivery available</label><div><label className="label" htmlFor={`offer-note-${requestId}`}>Offer details</label><textarea id={`offer-note-${requestId}`} name="note" className="input min-h-20" minLength={10} maxLength={1000} required defaultValue={existing?.note ?? ""} placeholder="Describe the item, inclusions, certification and next step." /></div>{error && <p role="alert" className="text-xs text-signal-err">{error}</p>}<button className="btn-primary px-4 py-2 text-xs" disabled={busy}>{busy ? "Saving…" : existing ? "Update offer" : "Send offer"}</button></form>;
}

function Mini({ idPrefix, label, name, defaultValue }: { idPrefix: string; label: string; name: string; defaultValue?: number }) { const id = `${name}-${idPrefix}`; return <div><label className="label" htmlFor={id}>{label}</label><input id={id} name={name} className="input" type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 180 : undefined} step={name === "days" ? 1 : 0.01} defaultValue={defaultValue} required /></div>; }

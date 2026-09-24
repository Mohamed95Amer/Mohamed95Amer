"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function VendorOfferForm({ requestId, existing, products = [], arabic = false }: { requestId: string; existing?: any; products?: Array<{ id: string; name: string; karat: number; weight_grams: number | string }>; arabic?: boolean }) {
  const router = useRouter();
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/vendor/buyer-requests/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, productId: form.get("productId") || null, totalPriceAed: Number(form.get("total")), makingChargeAed: Number(form.get("making")), certificateFeeAed: Number(form.get("certificate")), estimatedDays: Number(form.get("days")), supportsDelivery: form.get("delivery") === "on", note: form.get("note") }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setError(json.error ?? t("Could not submit offer.", "تعذر إرسال العرض.")); return; }
      setSaved(true); router.refresh();
    } catch { setError(t("Connection failed. Your offer is still here; please retry.", "تعذر الاتصال. عرضك ما زال هنا؛ حاول مرة أخرى.")); } finally { setBusy(false); }
  }
  return <details className="mt-4 rounded-xl border border-jade-900/10 bg-jade-50 p-4"><summary className="cursor-pointer text-sm font-semibold">{existing ? t("View or update your offer", "عرض عرضك أو تعديله") : t("Create an offer for this buyer", "تقديم عرض لهذا العميل")}</summary><form className="mt-4 grid gap-4" onSubmit={submit}>
    <div><label className="label" htmlFor={`offer-product-${requestId}`}>{t("Link a ready listing (recommended)", "اربط منتجاً جاهزاً (موصى به)")}</label><select id={`offer-product-${requestId}`} name="productId" className="input" defaultValue={existing?.product_id ?? ""}><option value="">{t("Custom item · arrange with store", "منتج مخصص · التنسيق مع المتجر")}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.karat}K · {p.weight_grams}g</option>)}</select><p className="mt-2 text-xs leading-relaxed text-ink-muted">{t("A linked approved listing lets the buyer use the normal checkout. This offer is indicative; availability and the final price still need your confirmation before payment.", "ربط منتج معتمد يتيح للعميل إتمام الشراء بالطريقة المعتادة. هذا عرض مبدئي؛ يجب تأكيد التوفر والسعر النهائي قبل الدفع.")}</p></div>
    <div className="grid grid-cols-2 gap-3"><Mini idPrefix={requestId} label={t("Indicative total (AED)", "الإجمالي المبدئي (درهم)")} name="total" defaultValue={existing?.total_price_aed} /><Mini idPrefix={requestId} label={t("Making charge", "المصنعية")} name="making" defaultValue={existing?.making_charge_aed ?? 0} /><Mini idPrefix={requestId} label={t("Certificate fee", "رسوم الشهادة")} name="certificate" defaultValue={existing?.certificate_fee_aed ?? 0} /><Mini idPrefix={requestId} label={t("Ready in days", "جاهز خلال (أيام)")} name="days" defaultValue={existing?.estimated_days ?? 3} /></div>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input name="delivery" type="checkbox" className="h-5 w-5 accent-jade-800" defaultChecked={existing?.supports_delivery ?? true} />{t("Delivery available", "التوصيل متاح")}</label>
    <div><label className="label" htmlFor={`offer-note-${requestId}`}>{t("Offer details", "تفاصيل العرض")}</label><textarea id={`offer-note-${requestId}`} name="note" className="input min-h-24" minLength={10} maxLength={1000} required defaultValue={existing?.note ?? ""} placeholder={t("Describe the item, what is included, certification and next step.", "صف المنتج وما يشمله والشهادة والخطوة التالية.")} /></div>
    {error && <p role="alert" className="text-xs text-signal-err">{error}</p>}{saved && <p role="status" className="text-sm text-jade-700">{t("Offer saved.", "تم حفظ العرض.")}</p>}
    <button className="btn-primary min-h-11" disabled={busy}>{busy ? t("Saving…", "جارٍ الحفظ…") : existing ? t("Update offer", "تحديث العرض") : t("Send offer", "إرسال العرض")}</button>
  </form></details>;
}
function Mini({ idPrefix, label, name, defaultValue }: { idPrefix: string; label: string; name: string; defaultValue?: number }) {
  const id = `${name}-${idPrefix}`;
  return <label htmlFor={id}><span className="label">{label}</span><input id={id} name={name} className="input" type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 180 : undefined} step={name === "days" ? 1 : 0.01} defaultValue={defaultValue} required /></label>;
}

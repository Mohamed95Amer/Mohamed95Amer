"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImageUploader } from "./ProductImageUploader";
import { ProductImage } from "./ProductImage";
import { SUPPORTED_KARATS, computePrice, formatAed } from "@/lib/pricing/calc";
import { useLiveGoldPrice } from "./GoldPriceProvider";
import { vendorCategories } from "@/lib/vendor-workspace";
import { productIntegrityIssues } from "@/lib/products/integrity";
interface ProductInitial {
  id?: string; name?: string; description?: string | null; category?: string; karat?: number; weight_grams?: number;
  making_charge?: number; making_charge_discount_percent?: number; making_charge_offer_ends_at?: string | null;
  certificate_fee?: number; stone_value?: number; vendor_rate_adjustment_per_gram?: number; assay_fineness?: number | null;
  vat_rate_bps?: number; quantity?: number; certificate_number?: string | null; hallmark_info?: string | null; images?: string[]; product_status?: string;
}
export function ProductForm({ initial, vendorId, arabic = false, canSubmit = true }: { initial?: ProductInitial; vendorId?: string; arabic?: boolean; canSubmit?: boolean }) {
  const router = useRouter();
  const t = (en: string, ar: string) => arabic ? ar : en;
  const live = useLiveGoldPrice();
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  const [form, setForm] = useState({
    name: initial?.name ?? "", description: initial?.description ?? "", category: initial?.category ?? "ring", karat: initial?.karat ?? 22,
    weight_grams: Number(initial?.weight_grams ?? 0), making_charge: Number(initial?.making_charge ?? 0),
    making_charge_discount_percent: Number(initial?.making_charge_discount_percent ?? 0), making_charge_offer_ends_at: toLocalDateTimeInput(initial?.making_charge_offer_ends_at),
    certificate_fee: Number(initial?.certificate_fee ?? 0), stone_value: Number(initial?.stone_value ?? 0),
    vendor_rate_adjustment_per_gram: Number(initial?.vendor_rate_adjustment_per_gram ?? 0), assay_fineness: initial?.assay_fineness ?? "",
    vat_rate_bps: initial?.vat_rate_bps ?? 500, vat_choice_confirmed: false, quantity: initial?.quantity ?? 1,
    certificate_number: initial?.certificate_number ?? "", hallmark_info: initial?.hallmark_info ?? "",
  });
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { dirty.current = true; setForm(f => ({ ...f, [key]: value })); }
  const integrity = productIntegrityIssues({ ...form, images });
  const checkTranslations: Record<string, string> = { NAME_TOO_SHORT: "أضف اسماً واضحاً لا يقل عن ٤ أحرف.", KARAT_TITLE_MISMATCH: "العيار في الاسم لا يطابق العيار المحدد.", CATEGORY_TITLE_MISMATCH: "طابق الاسم مع الفئة (Bar للسبائك أو Coin للعملات).", INVALID_WEIGHT: "أدخل وزن الذهب الصافي.", NO_SELLABLE_STOCK: "أضف قطعة متوفرة واحدة على الأقل.", INVALID_MAKING_DISCOUNT: "أدخل مصنعية أصلية قبل إضافة الخصم.", CERTIFICATE_REFERENCE_REQUIRED: "أضف مرجع الشهادة عند احتساب رسومها.", BULLION_EVIDENCE_REQUIRED: "أضف مرجع الشهادة أو بيانات الدمغة للسبائك والعملات.", DESCRIPTION_REQUIRED: "أضف وصفاً من ٢٠ حرفاً على الأقل.", PHOTO_REQUIRED: "أضف صورة واحدة على الأقل." };
  let preview = null;
  try {
    if (live.isFresh && live.tick?.status === "ok" && live.tick.price_per_gram_24k_aed && form.weight_grams > 0) preview = computePrice({
      pricePerGram24kAed: Number(live.tick.price_per_gram_24k_aed), karat: form.karat, weightGrams: Number(form.weight_grams),
      makingCharge: Number(form.making_charge), makingChargeDiscountPercent: Number(form.making_charge_discount_percent),
      makingChargeOfferEndsAt: form.making_charge_offer_ends_at ? new Date(form.making_charge_offer_ends_at).toISOString() : null,
      certificateFee: Number(form.certificate_fee), stoneValue: Number(form.stone_value), vendorPremium: 0,
      vendorRateAdjustmentPerGram: Number(form.vendor_rate_adjustment_per_gram), assayFineness: form.assay_fineness === "" ? null : Number(form.assay_fineness),
      platformFeeBps: 0, deliveryFee: 0, vatRateBps: Number(form.vat_rate_bps),
    });
  } catch { /* Incomplete inputs have no price preview until corrected. */ }
  async function save(submit: boolean) {
    if (busy || uploading || !formRef.current?.reportValidity()) return;
    if (submit && integrity.length) { setErr(t("Complete the listing checks before submitting.", "أكمل متطلبات المنتج قبل إرساله.")); setIssues(integrity.map(i => arabic ? checkTranslations[i.code] ?? i.message : i.message)); return; }
    setBusy(submit ? "submit" : "draft"); setErr(null); setIssues([]);
    try {
      const res = await fetch("/api/vendor/products", { method: initial?.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: initial?.id, ...form, karat: Number(form.karat), weight_grams: Number(form.weight_grams), making_charge: Number(form.making_charge),
        making_charge_discount_percent: Number(form.making_charge_discount_percent), making_charge_offer_ends_at: form.making_charge_offer_ends_at ? new Date(form.making_charge_offer_ends_at).toISOString() : null,
        certificate_fee: Number(form.certificate_fee), stone_value: Number(form.stone_value), vendor_rate_adjustment_per_gram: Number(form.vendor_rate_adjustment_per_gram),
        assay_fineness: form.assay_fineness === "" ? null : Number(form.assay_fineness), vendor_premium: 0, vat_rate_bps: Number(form.vat_rate_bps),
        quantity: Number(form.quantity), certificate_number: form.certificate_number || null, hallmark_info: form.hallmark_info || null, images, submit_for_approval: submit,
      }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(t("Could not save. Check the details below and try again.", "تعذر الحفظ. راجع التفاصيل التالية وحاول مرة أخرى."));
        setIssues(Array.isArray(body.issues) ? body.issues.map((i: { code: string; message: string }) => arabic ? checkTranslations[i.code] ?? i.message : i.message) : body.details?.fieldErrors ? Object.values(body.details.fieldErrors).flat().map(String) : [body.error ?? t("Please retry.", "حاول مرة أخرى.")]); return;
      }
      dirty.current = false;
      router.push("/vendor/products?saved=" + encodeURIComponent(body.status ?? "draft")); router.refresh();
    } catch { setErr(t("Connection failed. Your changes are still here; please retry.", "تعذر الاتصال. تعديلاتك ما زالت هنا؛ حاول مرة أخرى.")); } finally { setBusy(null); }
  }
  const numberField = (key: "weight_grams" | "quantity" | "making_charge" | "making_charge_discount_percent" | "certificate_fee" | "stone_value" | "vendor_rate_adjustment_per_gram", label: string, max: number, hint?: string) => <label className="block" key={key}><span className="label">{label}</span><input name={key} className="input mt-1" type="number" inputMode="decimal" min={key === "weight_grams" ? "0.001" : "0"} max={max} step={key === "weight_grams" ? "0.001" : ["quantity", "making_charge_discount_percent"].includes(key) ? "1" : "0.01"} required value={form[key]} onChange={e => set(key, Number(e.target.value))} />{hint && <span className="mt-2 block text-xs leading-relaxed text-ink-muted">{hint}</span>}</label>;
  return <form ref={formRef} onSubmit={e => { e.preventDefault(); save(false); }} dir={arabic ? "rtl" : "ltr"}>
    <div className="mb-5 flex flex-wrap gap-2">{[["piece-details", t("1. Product details", "١. بيانات المنتج")], ["piece-photos", t("2. Photos", "٢. الصور")], ["piece-pricing", t("3. Charges & VAT", "٣. الرسوم والضريبة")], ["piece-review", t("4. Review & save", "٤. المراجعة والحفظ")]].map(([href, label]) => <a key={href} href={"#" + href} className="rounded-full border border-jade-900/10 bg-white px-4 py-3 text-xs font-semibold text-jade-800">{label}</a>)}</div>
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]"><div className="min-w-0 space-y-6">
      <section id="piece-details" className="card scroll-mt-28 p-5 sm:p-6"><p className="eyebrow text-jade-600">01</p><h2 className="mt-1 font-serif text-2xl">{t("Tell us about the piece", "عرّفنا على المنتج")}</h2><p className="mt-2 text-sm text-ink-muted">{t("Use the exact purity and net gold weight, excluding stones.", "أدخل العيار والوزن الصافي للذهب دون الأحجار.")}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">{t("Product name", "اسم المنتج")}</span><input name="name" className="input mt-1" required minLength={2} maxLength={200} value={form.name} placeholder={t("e.g. 22K floral gold bangle", "مثال: سوار ذهب عيار 22K بزخارف الزهور")} onChange={e => set("name", e.target.value)} /></label>
        <label><span className="label">{t("Category", "الفئة")}</span><select name="category" className="input mt-1" value={form.category} onChange={e => { set("category", e.target.value); if (!["bar", "coin"].includes(e.target.value)) set("assay_fineness", ""); }}>{vendorCategories.map(([value, en, ar]) => <option key={value} value={value}>{arabic ? ar : en}</option>)}</select></label>
        <label><span className="label">{t("Gold purity", "عيار الذهب")}</span><select name="karat" className="input mt-1" value={form.karat} onChange={e => set("karat", Number(e.target.value))}>{SUPPORTED_KARATS.map(k => <option key={k} value={k}>{k}K</option>)}</select></label>
        {numberField("weight_grams", t("Net gold weight (grams)", "وزن الذهب الصافي (غرام)"), 10000)}
        {numberField("quantity", t("Stock quantity", "كمية المخزون"), 100000, t("Use 1 for a unique piece.", "استخدم ١ للقطعة الفريدة."))}
        <label className="sm:col-span-2"><span className="label">{t("Description", "الوصف")}</span><textarea name="description" className="input mt-1 min-h-28" maxLength={2000} value={form.description} onChange={e => set("description", e.target.value)} placeholder={t("Describe the design, size, finish and what is included.", "صف التصميم والمقاس والتشطيب وما يتضمنه المنتج.")} /><span className="mt-1 block text-xs text-ink-muted">{form.description.length}/2000 · {t("At least 20 characters to submit.", "٢٠ حرفاً على الأقل للإرسال.")}</span></label></div>
      </section>
      <section id="piece-photos" className="card scroll-mt-28 p-5 sm:p-6"><p className="eyebrow text-jade-600">02</p><h2 className="mb-5 mt-1 font-serif text-2xl">{t("Show the actual piece", "اعرض صورة المنتج الفعلي")}</h2>{vendorId && <ProductImageUploader vendorId={vendorId} value={images} arabic={arabic} onBusyChange={setUploading} onChange={paths => { dirty.current = true; setImages(paths); }} />}</section>
      <section id="piece-pricing" className="card scroll-mt-28 p-5 sm:p-6"><p className="eyebrow text-jade-600">03</p><h2 className="mt-1 font-serif text-2xl">{t("Your charges, clearly shown", "رسومك، بوضوح")}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("Gold follows the market. Set this item's own making charge; each product can have a different amount.", "يتبع الذهب سعر السوق. حدد مصنعية هذه القطعة؛ يمكن أن تختلف من منتج لآخر.")}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">{numberField("making_charge", t("Making per item (AED)", "المصنعية للقطعة (درهم)"), 1000000, t("Enter the total making charge for one piece, not per gram. Use zero if it does not apply.", "أدخل إجمالي مصنعية القطعة، وليس لكل غرام. ضع صفراً إن لم توجد مصنعية."))}{numberField("certificate_fee", t("Certificate / assay fee (AED)", "رسوم الشهادة أو الفحص (درهم)"), 1000000)}</div>
        <details className="mt-5 rounded-xl border border-jade-900/10 p-4" open={Number(form.stone_value) > 0 || Number(form.vendor_rate_adjustment_per_gram) > 0 || undefined}><summary className="cursor-pointer text-sm font-semibold">{t("Additional item costs", "تكاليف إضافية للمنتج")}</summary><div className="mt-4 grid gap-5 sm:grid-cols-2">{numberField("stone_value", t("Stone value (AED)", "قيمة الأحجار (درهم)"), 10000000)}{numberField("vendor_rate_adjustment_per_gram", t("Store rate adjustment (AED/g)", "تعديل سعر المتجر (درهم/غرام)"), 1000, t("Shown separately from gold and making.", "يظهر منفصلاً عن الذهب والمصنعية."))}</div></details>
        <details className="mt-4 rounded-xl border border-jade-900/10 p-4" open={form.making_charge_discount_percent > 0 || undefined}><summary className="cursor-pointer text-sm font-semibold">{t("Offer on making charge", "عرض على المصنعية")}</summary><div className="mt-4 grid gap-5 sm:grid-cols-2">{numberField("making_charge_discount_percent", t("Making discount (%)", "خصم المصنعية (%)"), 100, t("100% means free making. The gold value is unchanged.", "١٠٠٪ تعني مصنعية مجانية. لا تتغير قيمة الذهب."))}<label><span className="label">{t("Offer ends (optional, your device time)", "انتهاء العرض (اختياري، بتوقيت جهازك)")}</span><input name="making_charge_offer_ends_at" type="datetime-local" className="input mt-1" value={form.making_charge_offer_ends_at} onChange={e => set("making_charge_offer_ends_at", e.target.value)} /></label></div></details>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><label><span className="label">{t("Certificate or assay reference", "مرجع الشهادة أو الفحص")}</span><input name="certificate_number" className="input mt-1" maxLength={120} value={form.certificate_number} onChange={e => set("certificate_number", e.target.value)} /><span className="mt-1 block text-xs text-ink-muted">{t("Required when a certificate fee applies.", "مطلوب عند احتساب رسوم شهادة.")}</span></label><label><span className="label">{t("Hallmark details", "بيانات الدمغة")}</span><input name="hallmark_info" className="input mt-1" maxLength={200} value={form.hallmark_info} onChange={e => set("hallmark_info", e.target.value)} /></label>
        {["bar", "coin"].includes(form.category) && <label><span className="label">{t("Certified fineness (‰, optional)", "النقاوة المعتمدة (بالألف، اختياري)")}</span><input name="assay_fineness" type="number" className="input mt-1" min="500" max="1000" step="0.1" value={form.assay_fineness} onChange={e => set("assay_fineness", e.target.value === "" ? "" : Number(e.target.value))} placeholder="999.9" /><span className="mt-1 block text-xs text-ink-muted">{t("Use the exact value on the bullion certificate.", "استخدم القيمة الدقيقة في شهادة السبيكة أو العملة.")}</span></label>}</div>
        <fieldset className="mt-5 rounded-xl border border-jade-900/10 bg-bone-soft p-4"><legend className="px-1 text-sm font-semibold">{t("VAT treatment", "ضريبة القيمة المضافة")}</legend><label><span className="label">{t("VAT for this item", "ضريبة هذا المنتج")}</span><select name="vat_rate_bps" className="input mt-1" value={form.vat_rate_bps} onChange={e => { set("vat_rate_bps", Number(e.target.value)); set("vat_choice_confirmed", false); }}><option value={500}>{t("Charge 5% VAT", "احتساب ضريبة ٥٪")}</option><option value={0}>{t("Do not charge VAT", "عدم احتساب الضريبة")}</option></select></label>{form.vat_rate_bps === 0 && <label className="mt-3 flex items-start gap-3 text-sm leading-relaxed"><input name="vat_choice_confirmed" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-jade-800" checked={form.vat_choice_confirmed} onChange={e => set("vat_choice_confirmed", e.target.checked)} /><span>{t("I confirm that not charging VAT is appropriate for this item and my business. This selection does not establish a tax exemption.", "أؤكد أن عدم احتساب الضريبة مناسب لهذا المنتج ولنـشاطي. هذا الاختيار لا يثبت إعفاءً ضريبياً.")}</span></label>}{initial?.id && <p className="mt-2 text-xs text-ink-muted">{t("Changing VAT takes an approved listing off sale until reviewed again.", "تغيير الضريبة يوقف عرض المنتج المعتمد حتى تتم مراجعته مجدداً.")}</p>}</fieldset>
      </section>
    </div>
    <aside id="piece-review" className="scroll-mt-28 space-y-5 lg:sticky lg:top-28"><section className="card overflow-hidden"><div className="relative h-44 bg-bone-soft"><ProductImage name={form.name || t("Your product", "منتجك")} category={form.category} karat={form.karat} images={images} sizes="320px" /></div><div className="p-5"><p className="eyebrow text-jade-600">{t("Listing preview", "معاينة المنتج")}</p><h2 className="mt-2 break-words font-serif text-xl">{form.name || t("Your product name", "اسم منتجك")}</h2><p className="mt-1 text-xs text-ink-muted">{form.karat}K · {form.weight_grams}g</p>{preview ? <><dl className="mt-4 space-y-2 text-xs">{[[t("Gold value", "قيمة الذهب"), preview.goldValueAed], [t("Making after offer", "المصنعية بعد العرض"), preview.makingCharge], [t("Certificate", "الشهادة"), preview.certificateFee], [t("Stones", "الأحجار"), preview.stoneValue], [t("Store rate adjustment", "تعديل سعر المتجر"), preview.vendorRateAdjustmentAed]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd>{formatAed(Number(value))}</dd></div>)}</dl><div className="mt-4 border-t border-jade-900/10 pt-3"><p className="text-xs text-ink-muted">{t("Item subtotal", "المجموع الفرعي للقطعة")}</p><p className="mt-1 text-xl font-semibold">{formatAed(preview.merchandiseSubtotalAed)}</p><p className="mt-2 text-xs leading-relaxed text-ink-muted">{t("Before VAT, delivery and the customer's Get Gold fee. The final checkout total includes applicable charges.", "قبل الضريبة والتوصيل ورسوم Get Gold على العميل. يشمل إجمالي الشراء الرسوم المطبقة.")}</p></div></> : <p className="mt-4 text-xs text-ink-muted">{t("Add a valid weight. The subtotal appears when a fresh gold quote is available.", "أدخل وزناً صحيحاً. يظهر المجموع عند توفر سعر ذهب حديث.")}</p>}</div></section>
      <section className="card p-5"><h2 className="font-semibold">{t("Ready for review?", "جاهز للمراجعة؟")}</h2>{integrity.length ? <ul className="mt-3 space-y-2">{integrity.map(i => <li key={i.code} className="flex gap-2 text-xs leading-relaxed text-ink-muted"><span className="text-gold-700">○</span>{arabic ? checkTranslations[i.code] ?? i.message : i.message}</li>)}</ul> : <p className="mt-3 text-sm text-jade-700">{t("✓ Listing quality checks complete.", "✓ اكتملت متطلبات جودة المنتج.")}</p>}<p className="mt-4 text-xs leading-relaxed text-ink-muted">{t("Save a draft to return later. Submitting sends the piece to Get Gold for review.", "احفظ مسودة للعودة لاحقاً. الإرسال يحيل المنتج إلى Get Gold للمراجعة.")}</p>{!canSubmit && <p className="mt-3 text-xs text-gold-700">{t("You can save drafts while your store awaits approval.", "يمكنك حفظ المسودات حتى اعتماد متجرك.")}</p>}</section>
    </aside></div>
    {err && <div role="alert" className="mt-5 rounded-xl border border-signal-err/20 bg-signal-err/5 p-4 text-sm text-signal-err"><p className="font-semibold">{err}</p>{issues.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1">{issues.map((i, n) => <li key={n}>{i}</li>)}</ul>}</div>}
    <div className="sticky bottom-3 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-jade-900/15 bg-white/95 p-4 shadow-lg backdrop-blur"><p className="text-xs text-ink-muted">{uploading ? t("Wait for photos to finish uploading…", "انتظر اكتمال رفع الصور…") : t("Changes are saved when you press Save.", "تُحفظ التعديلات عند الضغط على الحفظ.")}</p><div className="flex flex-wrap gap-2"><button type="submit" className="btn-ghost" disabled={busy !== null || uploading}>{busy === "draft" ? t("Saving…", "جارٍ الحفظ…") : initial?.product_status === "approved" ? t("Save changes", "حفظ التعديلات") : t("Save draft", "حفظ مسودة")}</button><button type="button" className="btn-primary" disabled={busy !== null || uploading || !canSubmit || initial?.product_status === "suspended"} onClick={() => save(true)}>{busy === "submit" ? t("Submitting…", "جارٍ الإرسال…") : initial?.product_status === "approved" && form.vat_rate_bps === initial.vat_rate_bps ? t("Update product", "تحديث المنتج") : t("Submit for review", "إرسال للمراجعة")}</button></div></div>
  </form>;
}
function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; title: string; service_fee_discount_percent: number; delivery_discount_percent: number; starts_at: string; ends_at: string; cancelled_at: string | null };
type Banner = { id: string; title: string; placement: string; image_path: string | null; media_type: "image" | "video"; starts_at: string; ends_at: string; cancelled_at: string | null };

export function AdminMarketingControls({ campaigns, banners, arabic = false }: { campaigns: Campaign[]; banners: Banner[]; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createCampaign(formData: FormData) {
    setBusy(true); setMessage(null);
    const startsAt = String(formData.get("startsAt") ?? "");
    const response = await fetch("/api/admin/marketplace-promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: formData.get("title"), serviceFeeDiscountPercent: Number(formData.get("serviceFeeDiscountPercent")), deliveryDiscountPercent: Number(formData.get("deliveryDiscountPercent")), durationDays: Number(formData.get("durationDays")), startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    }) });
    await finish(response);
  }

  async function createBanner(formData: FormData) {
    setBusy(true); setMessage(null);
    const startsAt = String(formData.get("startsAt") ?? "");
    if (startsAt) formData.set("startsAt", new Date(startsAt).toISOString());
    const response = await fetch("/api/admin/banners", { method: "POST", body: formData });
    await finish(response);
  }

  async function cancel(endpoint: string, id: string) {
    setBusy(true); setMessage(null);
    const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await finish(response);
  }

  async function finish(response: Response) {
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setMessage(arabic ? "تعذر حفظ التغيير. راجع البيانات وحاول مجدداً." : typeof body.error === "string" ? body.error : "Could not save this change"); return; }
    setMessage(t("Saved and recorded in the audit log.", "تم الحفظ وتسجيل الإجراء في سجل التدقيق.")); router.refresh();
  }

  return <div className="grid gap-6" dir={arabic ? "rtl" : "ltr"}>
    <section className="card p-6">
      <p className="eyebrow text-jade-600">{t("Pricing campaign", "حملة أسعار")}</p><h2 className="mt-1 font-serif text-2xl">{t("Seasonal fee and delivery discounts", "خصومات موسمية للرسوم والتوصيل")}</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("A Get Gold fee discount is applied after the customer’s first-three-orders offer. Delivery discounts apply once per delivery order and are treated as a Get Gold-funded credit to the vendor. Checkout snapshots the campaign and exact settlement amounts.", "يُطبق خصم رسوم Get Gold بعد عرض أول ثلاثة طلبات للعميل. يُطبق خصم التوصيل مرة لكل طلب توصيل، ويُسجل رصيداً للمتجر تموله Get Gold. تُحفظ الحملة ومبالغ التسوية الدقيقة مع الطلب.")}</p>
      <form action={createCampaign} className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2"><label className="label" htmlFor="campaign-title">{t("Campaign name", "اسم الحملة")}</label><input id="campaign-title" className="input" name="title" required maxLength={100} placeholder={t("Eid delivery offer", "عرض توصيل العيد")} /></div>
        <div><label className="label" htmlFor="fee-discount">{t("Get Gold fee discount", "خصم رسوم Get Gold")}</label><div className="relative"><input id="fee-discount" className="input pe-8" name="serviceFeeDiscountPercent" type="number" min={0} max={100} defaultValue={0} required /><span className="absolute end-3 top-3 text-sm text-ink-muted">%</span></div></div>
        <div><label className="label" htmlFor="delivery-discount">{t("Delivery discount", "خصم التوصيل")}</label><div className="relative"><input id="delivery-discount" className="input pe-8" name="deliveryDiscountPercent" type="number" min={0} max={100} defaultValue={100} required /><span className="absolute end-3 top-3 text-sm text-ink-muted">%</span></div></div>
        <div><label className="label" htmlFor="campaign-days">{t("Duration", "المدة")}</label><div className="relative"><input id="campaign-days" className="input pe-12" name="durationDays" type="number" min={1} max={90} defaultValue={7} required /><span className="absolute end-3 top-3 text-xs text-ink-muted">{t("days", "أيام")}</span></div></div>
        <div><label className="label" htmlFor="campaign-start">{t("Starts (optional)", "تاريخ البدء (اختياري)")}</label><input id="campaign-start" className="input" name="startsAt" type="datetime-local" /></div>
        <div className="md:col-span-2 flex items-end"><button className="btn-primary" disabled={busy}>{t("Schedule campaign", "جدولة الحملة")}</button></div>
      </form>
      <HistoryTable rows={campaigns.map((item) => ({ ...item, name: item.title, details: arabic ? `خصم رسوم ${item.service_fee_discount_percent}% · توصيل ${item.delivery_discount_percent}%` : `${item.service_fee_discount_percent}% fee · ${item.delivery_discount_percent}% delivery` }))} onCancel={(id) => cancel("/api/admin/marketplace-promotions", id)} busy={busy} arabic={arabic} />
    </section>

    <section className="card p-6">
      <p className="eyebrow text-jade-600">{t("Creative control", "إدارة المحتوى الإعلاني")}</p><h2 className="mt-1 font-serif text-2xl">{t("Marketplace ad banners", "لافتات إعلانية للسوق")}</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("Upload promotional artwork or short video, or publish a text-only banner. Homepage-top items automatically rotate as a showcase before “Find your piece.”", "ارفع صورة أو فيديو قصيراً، أو انشر لافتة نصية فقط. تتناوب لافتات أعلى الصفحة الرئيسية تلقائياً قبل قسم «اعثر على قطعتك».")}</p>
      <form action={createBanner} className="mt-5 grid gap-4 md:grid-cols-2">
        <div><label className="label" htmlFor="banner-title">{t("Headline", "العنوان")}</label><input id="banner-title" className="input" name="title" required maxLength={100} /></div>
        <div><label className="label" htmlFor="banner-placement">{t("Placement", "الموضع")}</label><select id="banner-placement" className="input" name="placement" defaultValue="home_top"><option value="home_top">{t("Homepage · top", "الرئيسية · أعلى")}</option><option value="home_middle">{t("Homepage · middle", "الرئيسية · وسط")}</option><option value="marketplace_top">{t("Marketplace · top", "السوق · أعلى")}</option><option value="vendors_top">{t("Vendor directory · top", "دليل المتاجر · أعلى")}</option></select></div>
        <div className="md:col-span-2"><label className="label" htmlFor="banner-body">{t("Supporting text", "النص المساند")}</label><textarea id="banner-body" className="input min-h-20" name="body" maxLength={280} /></div>
        <div><label className="label" htmlFor="banner-image">{t("Photo or video (optional)", "صورة أو فيديو (اختياري)")}</label><input id="banner-image" className="input file:me-3 file:border-0 file:bg-transparent file:font-semibold" name="image" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" /><p className="mt-1 text-xs text-ink-muted">{t("Images up to 5 MB; MP4/WebM video up to 20 MB.", "الصور حتى 5 ميغابايت؛ فيديو MP4/WebM حتى 20 ميغابايت.")}</p></div>
        <div><label className="label" htmlFor="banner-alt">{t("Media description", "وصف الوسائط")}</label><input id="banner-alt" className="input" name="imageAlt" maxLength={160} placeholder={t("Required when media is uploaded", "مطلوب عند رفع صورة أو فيديو")} /></div>
        <div><label className="label" htmlFor="banner-cta">{t("Button text (optional)", "نص الزر (اختياري)")}</label><input id="banner-cta" className="input" name="ctaLabel" maxLength={40} placeholder={t("Shop the offer", "تسوق العرض")} /></div>
        <div><label className="label" htmlFor="banner-href">{t("Button link", "رابط الزر")}</label><input id="banner-href" className="input" dir="ltr" name="ctaHref" maxLength={500} placeholder="/marketplace or https://…" /></div>
        <div><label className="label" htmlFor="banner-days">{t("Duration (days)", "المدة (أيام)")}</label><input id="banner-days" className="input" name="durationDays" type="number" min={1} max={90} defaultValue={7} required /></div>
        <div><label className="label" htmlFor="banner-order">{t("Display priority", "أولوية العرض")}</label><input id="banner-order" className="input" name="displayOrder" type="number" min={0} max={100} defaultValue={0} required /><p className="mt-1 text-xs text-ink-muted">{t("Lower numbers appear first.", "تظهر الأرقام الأصغر أولاً.")}</p></div>
        <div><label className="label" htmlFor="banner-start">{t("Starts (optional)", "تاريخ البدء (اختياري)")}</label><input id="banner-start" className="input" name="startsAt" type="datetime-local" /></div>
        <div className="flex items-end"><button className="btn-primary" disabled={busy}>{t("Schedule banner", "جدولة اللافتة")}</button></div>
      </form>
      <HistoryTable rows={banners.map((item) => ({ ...item, name: item.title, details: arabic ? ({ home_top: "الرئيسية · أعلى", home_middle: "الرئيسية · وسط", marketplace_top: "السوق · أعلى", vendors_top: "دليل المتاجر · أعلى" } as Record<string,string>)[item.placement] ?? item.placement : item.placement.replaceAll("_", " ") }))} onCancel={(id) => cancel("/api/admin/banners", id)} busy={busy} arabic={arabic} />
    </section>
    {message && <p role="status" className={`text-sm ${message.startsWith("Saved") || message.startsWith("تم الحفظ") ? "text-signal-ok" : "text-signal-err"}`}>{message}</p>}
  </div>;
}

function HistoryTable({ rows, onCancel, busy, arabic = false }: { rows: Array<{ id: string; name: string; details: string; starts_at: string; ends_at: string; cancelled_at: string | null }>; onCancel: (id: string) => void; busy: boolean; arabic?: boolean }) {
  const now = Date.now();
  return <div className="mt-6 overflow-x-auto rounded-xl border border-jade-900/10"><table className="min-w-[620px] w-full text-sm"><thead className="bg-bone-soft text-ink-muted"><tr><th className="px-3 py-2 text-start">{arabic ? "الاسم" : "Name"}</th><th className="px-3 py-2 text-start">{arabic ? "العرض" : "Offer"}</th><th className="px-3 py-2 text-start">{arabic ? "التواريخ" : "Dates"}</th><th className="px-3 py-2 text-start">{arabic ? "الحالة" : "Status"}</th><th /></tr></thead><tbody>{rows.map((item) => { const active = !item.cancelled_at && Date.parse(item.starts_at) <= now && Date.parse(item.ends_at) > now; const upcoming = !item.cancelled_at && Date.parse(item.starts_at) > now; return <tr key={item.id} className="border-t border-bone-deep"><td className="px-3 py-2 font-medium">{item.name}</td><td className="px-3 py-2 capitalize">{item.details}</td><td className="px-3 py-2 text-xs">{date(item.starts_at, arabic)} → {date(item.ends_at, arabic)}</td><td className="px-3 py-2">{item.cancelled_at ? arabic ? "ملغى" : "Cancelled" : active ? arabic ? "نشط" : "Active" : upcoming ? arabic ? "مجدول" : "Scheduled" : arabic ? "منتهٍ" : "Ended"}</td><td className="px-3 py-2 text-end">{(active || upcoming) && <button type="button" className="text-xs font-semibold text-signal-err underline" disabled={busy} onClick={() => onCancel(item.id)}>{arabic ? "إلغاء" : "Cancel"}</button>}</td></tr>; })}{rows.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-ink-muted">{arabic ? "لم يُنشر شيء بعد." : "Nothing published yet."}</td></tr>}</tbody></table></div>;
}

function date(value: string, arabic = false) { return new Intl.DateTimeFormat(arabic ? "ar-AE" : "en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }

import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { AcceptOfferButton } from "@/components/AcceptOfferButton";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AccountRequestsPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const admin = getServiceSupabase();
  const { data: requests } = await admin.from("buyer_requests").select("*, offers:buyer_request_offers(*, vendor:vendors(business_name, emirate, verification_status), product:products(id, name, karat, weight_grams))").eq("customer_user_id", user.id).order("created_at", { ascending: false });
  return (
    <main className="container-pro py-10 sm:py-14" dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">{t("Your demand", "طلبك")}</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">{t("Gold requests & offers", "طلبات الذهب والعروض")}</h1></div><Link href="/requests/new" className="btn-primary">{t("+ New request", "+ طلب جديد")}</Link></div>
      <div className="mt-8 space-y-5">
        {(requests ?? []).map((request) => (
          <article key={request.id} className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-jade-600">{ar ? `عيار ${request.karat}` : `${request.karat}K`} · {request.category} · {request.emirate}</p><h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">{formatAed(request.budget_min_aed)}–{formatAed(request.budget_max_aed)}</h2></div><span className="pill border-jade-900/10 bg-jade-50">{ar ? ({ open: "مفتوح", accepted: "تم قبول عرض", closed: "مغلق", cancelled: "ملغى" } as Record<string,string>)[request.status] ?? statusLabel(request.status) : statusLabel(request.status)}</span></div>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{request.description}</p>
            <p className="mt-2 text-xs text-ink-muted">{t("Submitted", "أُرسل")}{" "}{formatDubaiDateTime(request.created_at)}{request.needed_by ? ` · ${t("Needed by", "الموعد المطلوب")} ${request.needed_by}` : ""}</p>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {(request.offers ?? []).map((offer: any) => {
                const vendor = Array.isArray(offer.vendor) ? offer.vendor[0] : offer.vendor;
                const product = Array.isArray(offer.product) ? offer.product[0] : offer.product;
                return <div key={offer.id} className={`rounded-2xl border p-4 ${offer.status === "accepted" ? "border-signal-ok/40 bg-signal-ok/5" : "border-jade-900/10 bg-bone-soft"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-jade-950">{vendor?.business_name ?? t("Verified store", "متجر موثّق")}</p><p className="text-xs text-ink-muted">{vendor?.emirate} · {offer.estimated_days} {t("days", "أيام")}</p></div><p className="font-serif text-xl font-semibold text-jade-950">{formatAed(offer.total_price_aed)}</p></div>{product && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-jade-700">{t("Ready listing:", "منتج مدرج:")} {product.name} · {ar ? `عيار ${product.karat}` : `${product.karat}K`} · {product.weight_grams}{t("g", "غ")}</p>}<p className="mt-2 text-xs text-ink-muted">{t("Making", "المصنعية")} {formatAed(offer.making_charge_aed)} · {t("Certificate", "الشهادة")} {formatAed(offer.certificate_fee_aed)} · {offer.supports_delivery ? t("Delivery available", "التوصيل متاح") : t("Collection only", "الاستلام فقط")}</p><p className="mt-2 text-sm text-ink-muted">{offer.note}</p><div className="mt-3">{request.status === "open" && offer.status === "submitted" ? <AcceptOfferButton offerId={offer.id} arabic={ar} /> : offer.status === "accepted" && product ? <div><Link href={`/products/${product.id}`} className="btn-primary px-4 py-2 text-xs">{t("Review product & request to buy", "راجع المنتج واطلب شراءه")}</Link><p className="mt-2 text-[11px] text-ink-muted">{t("The earlier offer is indicative. The store must confirm availability and the final current price before you pay.", "العرض السابق تقديري. يجب على المتجر تأكيد التوفر والسعر النهائي الحالي قبل أن تدفع.")}</p></div> : <span className="text-xs font-semibold text-jade-700">{ar ? ({ accepted: "مقبول", submitted: "مُرسل", declined: "مرفوض", withdrawn: "مسحوب" } as Record<string,string>)[offer.status] ?? statusLabel(offer.status) : statusLabel(offer.status)}</span>}</div></div>;
              })}
              {(request.offers ?? []).length === 0 && <p className="rounded-xl bg-jade-50 p-4 text-sm text-ink-muted">{t("No offers yet. Verified stores can respond while this request is open.", "لا توجد عروض بعد. يمكن للمتاجر الموثّقة الرد ما دام الطلب مفتوحاً.")}</p>}
            </div>
          </article>
        ))}
        {(requests ?? []).length === 0 && <div className="card p-8 text-center"><h2 className="font-serif text-2xl text-jade-950">{t("No requests yet", "لا توجد طلبات بعد")}</h2><p className="mt-2 text-sm text-ink-muted">{t("Tell local stores what you want instead of searching every catalogue.", "أخبر المتاجر بما تبحث عنه بدلاً من تصفح كل المنتجات.")}</p><Link href="/requests/new" className="btn-primary mt-5">{t("Create your first request", "أنشئ طلبك الأول")}</Link></div>}
      </div>
    </main>
  );
}

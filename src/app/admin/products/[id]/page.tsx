import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminProductActions } from "./AdminProductActions";
import { ProductImage } from "@/components/ProductImage";
import { cookies } from "next/headers";
import { localizedStatusLabel } from "@/lib/localized-status";

export const dynamic = "force-dynamic";

export default async function AdminProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const { id } = await params;
  const admin = getServiceSupabase();
  const { data: p } = await admin
    .from("products")
    .select("*, vendor:vendors(id, business_name, verification_status)")
    .eq("id", id)
    .single();
  if (!p) return notFound();
  const v = p.vendor as unknown as { id: string; business_name: string; verification_status: string } | null;

  return (
    <div className="grid gap-6" dir={ar ? "rtl" : "ltr"}>
      <div className="card p-6">
        <h2 className="font-serif text-2xl">{p.name}</h2>
        <p className="text-sm text-ink-muted">
          {p.category} · {ar ? `عيار ${p.karat}` : `${p.karat}K`} · {p.weight_grams}{t("g", "غ")} · {t("qty", "الكمية")} {p.quantity}
        </p>
        {v && (
          <p className="text-sm mt-2">
            {t("Vendor:", "المتجر:")} <span className="font-medium">{v.business_name}</span>{" "}
            <span className="pill border-bone-deep bg-bone-soft ms-2">{localizedStatusLabel(v.verification_status, ar)}</span>
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-muted">{t("Making", "المصنعية")}</dt><dd>{p.making_charge}</dd>
          <dt className="text-ink-muted">{t("Making discount", "خصم المصنعية")}</dt><dd>{p.making_charge_discount_percent}%</dd>
          <dt className="text-ink-muted">{t("Offer ends", "ينتهي العرض")}</dt><dd>{p.making_charge_offer_ends_at ? new Date(p.making_charge_offer_ends_at).toLocaleString(ar ? "ar-AE" : "en-AE", { timeZone: "Asia/Dubai" }) : "—"}</dd>
          <dt className="text-ink-muted">{t("Certificate / assay fee", "رسوم الشهادة / الفحص")}</dt><dd>{p.certificate_fee}</dd>
          <dt className="text-ink-muted">{t("Stone", "الأحجار")}</dt><dd>{p.stone_value}</dd>
          <dt className="text-ink-muted">{t("Store rate adjustment", "تعديل سعر المتجر")}</dt><dd>{p.vendor_rate_adjustment_per_gram ?? 0} {t("AED/g", "درهم/غ")}</dd>
          <dt className="text-ink-muted">{t("Certified fineness", "النقاء المعتمد")}</dt><dd>{p.assay_fineness ? `${p.assay_fineness}‰` : "—"}</dd>
          <dt className="text-ink-muted">{t("Vendor VAT selection", "اختيار المتجر للضريبة")}</dt><dd>{Number(p.vat_rate_bps) === 0 ? t("No VAT charged — verify tax treatment before approval", "دون ضريبة — تحقق من المعاملة الضريبية قبل الاعتماد") : t("5% VAT", "ضريبة 5%")}</dd>
          <dt className="text-ink-muted">{t("Certificate", "الشهادة")}</dt><dd>{p.certificate_number ?? "—"}</dd>
          <dt className="text-ink-muted">{t("Hallmark", "الدمغة")}</dt><dd>{p.hallmark_info ?? "—"}</dd>
        </dl>
        {p.description && <p className="mt-3 text-ink leading-relaxed">{p.description}</p>}
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-jade-950">{t("Vendor-supplied photos", "صور مقدمة من المتجر")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(Array.isArray(p.images) ? p.images : []).map((image: string, index: number) => (
              <div key={`${image}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-jade-900/10 bg-bone-soft">
                <ProductImage category={p.category} karat={p.karat} name={`${p.name} ${t("photo", "صورة")} ${index + 1}`} images={[image]} sizes="240px" />
              </div>
            ))}
            {(!Array.isArray(p.images) || p.images.length === 0) && <p className="text-sm text-ink-muted">{t("No photos uploaded; customers see the category illustration.", "لم تُرفع صور؛ سيرى العملاء رسماً توضيحياً للفئة.")}</p>}
          </div>
        </div>
      </div>
      <div className="card p-6">
        <h3 className="font-serif text-xl">{t("Decision", "القرار")}</h3>
        {Array.isArray(p.data_quality_issues) && p.data_quality_issues.length > 0 && (
          <div className="mt-3 rounded-xl border border-signal-err/20 bg-signal-err/5 p-4 text-sm text-signal-err">
            <p className="font-semibold">{t("Approval is blocked until these issues are fixed:", "يتعذر الاعتماد حتى إصلاح المشكلات التالية:")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {p.data_quality_issues.map((issue: { code?: string; message?: string }, index: number) => (
                <li key={`${issue.code ?? "issue"}-${index}`}>{issue.message ?? issue.code ?? t("Invalid listing data", "بيانات منتج غير صالحة")}</li>
              ))}
            </ul>
          </div>
        )}
        <AdminProductActions productId={p.id} currentStatus={p.product_status} arabic={ar} />
      </div>
    </div>
  );
}

import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminReviewActions } from "./AdminReviewActions";
import { cookies } from "next/headers";
import { localizedStatusLabel } from "@/lib/localized-status";

export const dynamic = "force-dynamic";

interface ReviewAdminRow {
  id: string;
  overall_rating: number;
  customer_display_name: string;
  title: string | null;
  comment: string | null;
  moderation_status: string;
  vendor_reply: string | null;
  vendor_reply_status: string;
  created_at: string;
  vendor: { business_name: string } | Array<{ business_name: string }> | null;
  product: { name: string } | Array<{ name: string }> | null;
}

interface ReportRow {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  review: ReviewAdminRow | ReviewAdminRow[] | null;
}

export default async function AdminReviewsPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const [{ data: reports }, { data: reviews }] = await Promise.all([
    admin
      .from("review_reports")
      .select("id, reason, details, created_at, review:reviews(id, overall_rating, customer_display_name, title, comment, moderation_status, vendor_reply, vendor_reply_status, created_at, vendor:vendors(business_name), product:products(name))")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    admin
      .from("reviews")
      .select("id, overall_rating, customer_display_name, title, comment, moderation_status, vendor_reply, vendor_reply_status, created_at, vendor:vendors(business_name), product:products(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div>
      <h2 className="font-serif text-2xl">{t("Review moderation", "إدارة التقييمات")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("Reports never hide content automatically. Review the evidence, then dismiss or uphold.", "لا تخفي البلاغات المحتوى تلقائيًا. راجع الأدلة ثم ارفض البلاغ أو اعتمده.")}</p>

      <section className="mt-6">
        <h3 className="font-serif text-xl text-jade-950">{t("Open reports", "البلاغات المفتوحة")} ({(reports ?? []).length})</h3>
        <div className="mt-3 space-y-3">
          {((reports ?? []) as ReportRow[]).map((report) => {
            const review = one(report.review);
            if (!review) return null;
            return (
              <article key={report.id} className="card border-signal-warn/25 p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-signal-warn">{arabic ? ({ spam: "محتوى مزعج", fake_or_misleading: "مضلل أو غير حقيقي", abusive: "لغة مسيئة", personal_information: "معلومات شخصية", other: "سبب آخر" } as Record<string, string>)[report.reason] ?? report.reason : report.reason.replaceAll("_", " ")}</p>
                {report.details && <p className="mt-1 text-sm text-ink-muted">{report.details}</p>}
                <ReviewAdminSummary review={review} arabic={arabic} />
                <AdminReviewActions reviewId={review.id} reportId={report.id} arabic={arabic} />
              </article>
            );
          })}
          {(reports ?? []).length === 0 && <p className="card p-5 text-sm text-ink-muted">{t("No open reports.", "لا توجد بلاغات مفتوحة.")}</p>}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="font-serif text-xl text-jade-950">{t("All reviews", "جميع التقييمات")}</h3>
        <div className="mt-3 space-y-3">
          {((reviews ?? []) as ReviewAdminRow[]).map((review) => (
            <article key={review.id} className="card p-5">
              <ReviewAdminSummary review={review} arabic={arabic} />
              <AdminReviewActions reviewId={review.id} arabic={arabic} />
            </article>
          ))}
          {(reviews ?? []).length === 0 && <p className="card p-5 text-sm text-ink-muted">{t("No reviews yet.", "لا توجد تقييمات بعد.")}</p>}
        </div>
      </section>
    </div>
  );
}

function ReviewAdminSummary({ review, arabic }: { review: ReviewAdminRow; arabic: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const vendor = one(review.vendor);
  const product = one(review.product);
  return (
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-[1fr_auto]">
      <div>
        <p className="font-semibold text-jade-950">{review.overall_rating}/5 · {review.customer_display_name} · {product?.name ?? t("Product", "منتج")}</p>
        <p className="text-xs text-ink-muted">{vendor?.business_name ?? t("Store", "متجر")} · {t("review", "التقييم")} {localizedStatusLabel(review.moderation_status, arabic)} · {t("reply", "الرد")} {review.vendor_reply ? localizedStatusLabel(review.vendor_reply_status, arabic) : t("none", "لا يوجد")}</p>
        {review.title && <p className="mt-2 font-medium">{review.title}</p>}
        {review.comment && <p className="mt-1 text-ink-muted">{review.comment}</p>}
        {review.vendor_reply && <p className="mt-2 rounded-lg bg-jade-50 p-2 text-xs text-ink-muted">{t("Store", "المتجر")}: {review.vendor_reply}</p>}
      </div>
      <time className="text-xs text-ink-muted">{new Date(review.created_at).toLocaleDateString(arabic ? "ar-AE" : "en-AE", { timeZone: "Asia/Dubai" })}</time>
    </div>
  );
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

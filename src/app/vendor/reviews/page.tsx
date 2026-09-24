import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  normalizeReputation,
  oneRelation,
  PUBLIC_REVIEW_SELECT,
  type PublicReview,
  type VendorReputationRow,
} from "@/lib/reputation";
import { ReputationOverview } from "@/components/StoreReputation";
import { VendorReviewReplyForm } from "@/components/VendorReviewReplyForm";
import { VendorNav } from "@/components/VendorNav";

export const dynamic = "force-dynamic";

export default async function VendorReviewsPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id, business_name").eq("owner_user_id", user.id).maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const [{ data: reviews, error: reviewError }, { data: reputationRow, error: reputationError }] = await Promise.all([
    admin
      .from("reviews")
      .select(PUBLIC_REVIEW_SELECT)
      .eq("vendor_id", vendor.id)
      .eq("moderation_status", "published")
      .order("created_at", { ascending: false }),
    admin.from("vendor_reputation_summary").select("*").eq("vendor_id", vendor.id).maybeSingle(),
  ]);
  if (reviewError || reputationError) throw new Error("Could not load store reputation.");
  const reputation = reputationRow ? normalizeReputation(reputationRow as VendorReputationRow) : null;

  return (
    <div className="container-pro py-8 sm:py-10">
      <p className="eyebrow text-jade-600">{t("Store reputation", "سمعة المتجر")}</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-jade-950 sm:text-4xl">{t("Reviews for", "تقييمات")} {vendor.business_name}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        {t("Reviews come only from completed purchases. You can publish one response to each review; reviews cannot be removed by the store.", "التقييمات تأتي من عمليات شراء مكتملة فقط. يمكنك نشر رد واحد لكل تقييم، ولا يستطيع المتجر حذف التقييمات.")}
      </p>
      <VendorNav arabic={ar} />

      {reputation && <div className="mt-7"><ReputationOverview reputation={reputation} /></div>}

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-jade-950">{t("Verified buyer feedback", "آراء المشترين الموثّقة")}</h2>
        <div className="mt-5 space-y-4">
          {((reviews ?? []) as PublicReview[]).map((review) => {
            const product = oneRelation(review.product);
            return (
              <article key={review.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-gold-500" aria-label={`${review.overall_rating} out of 5 stars`}>
                      <span aria-hidden="true">{"★".repeat(review.overall_rating)}{"☆".repeat(5 - review.overall_rating)}</span>
                    </p>
                    <p className="mt-1 text-sm font-semibold text-jade-950">{review.customer_display_name} · {t("verified purchase", "شراء موثّق")}</p>
                  </div>
                  <span className="text-xs text-ink-muted">{product?.name ?? "Gold product"}</span>
                </div>
                {review.title && <h3 className="mt-4 font-serif text-xl font-semibold text-jade-950">{review.title}</h3>}
                {review.comment && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{review.comment}</p>}
                <VendorReviewReplyForm reviewId={review.id} initialReply={review.vendor_reply} arabic={ar} />
              </article>
            );
          })}
          {(reviews ?? []).length === 0 && (
            <div className="card p-8 text-center text-sm text-ink-muted">{t("No verified reviews yet. Completed buyers can share their experience here.", "لا توجد تقييمات موثّقة بعد. يمكن للمشترين مشاركة تجربتهم بعد إكمال طلباتهم.")}</div>
          )}
        </div>
      </section>
    </div>
  );
}

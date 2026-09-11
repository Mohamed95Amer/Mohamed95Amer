import { redirect } from "next/navigation";
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

export const dynamic = "force-dynamic";

export default async function VendorReviewsPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id, business_name").eq("owner_user_id", user.id).maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const [{ data: reviews }, { data: reputationRow }] = await Promise.all([
    admin
      .from("reviews")
      .select(PUBLIC_REVIEW_SELECT)
      .eq("vendor_id", vendor.id)
      .eq("moderation_status", "published")
      .order("created_at", { ascending: false }),
    admin.from("vendor_reputation_summary").select("*").eq("vendor_id", vendor.id).maybeSingle(),
  ]);
  const reputation = reputationRow ? normalizeReputation(reputationRow as VendorReputationRow) : null;

  return (
    <div className="container-pro py-10 sm:py-14">
      <p className="eyebrow text-jade-600">Store reputation</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">Reviews for {vendor.business_name}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Reviews come only from completed purchases. You can publish one response to each review;
        reviews cannot be removed by the store.
      </p>

      {reputation && <div className="mt-7"><ReputationOverview reputation={reputation} /></div>}

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-jade-950">Verified buyer feedback</h2>
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
                    <p className="mt-1 text-sm font-semibold text-jade-950">{review.customer_display_name} · verified purchase</p>
                  </div>
                  <span className="text-xs text-ink-muted">{product?.name ?? "Gold product"}</span>
                </div>
                {review.title && <h3 className="mt-4 font-serif text-xl font-semibold text-jade-950">{review.title}</h3>}
                {review.comment && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{review.comment}</p>}
                <VendorReviewReplyForm reviewId={review.id} initialReply={review.vendor_reply} />
              </article>
            );
          })}
          {(reviews ?? []).length === 0 && (
            <div className="card p-8 text-center text-sm text-ink-muted">No verified reviews yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

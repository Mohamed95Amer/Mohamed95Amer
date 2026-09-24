import Link from "next/link";
import { oneRelation, type PublicReview } from "@/lib/reputation";
import { ReviewReportButton } from "./ReviewReportButton";

export function ReviewList({
  reviews,
  showProduct = false,
  emptyMessage = "No verified purchase reviews yet.",
}: {
  reviews: PublicReview[];
  showProduct?: boolean;
  emptyMessage?: string;
}) {
  if (reviews.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-jade-900/15 bg-jade-50/50 px-6 py-10 text-center">
        <p className="font-serif text-xl font-semibold text-jade-950">Be the first verified buyer to review</p>
        <p className="mt-1 text-sm text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => {
        const product = oneRelation(review.product);
        const edited = Math.abs(Date.parse(review.updated_at) - Date.parse(review.created_at)) > 60_000;
        return (
          <article key={review.id} className="card p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gold-500" aria-label={`${review.overall_rating} out of 5 stars`}>
                    <span aria-hidden="true">{ratingStars(review.overall_rating)}</span>
                  </span>
                  <span className="pill border-signal-ok/25 bg-signal-ok/10 text-[9px] font-bold text-signal-ok">
                    ✓ Verified purchase
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-jade-950">{review.customer_display_name}</p>
                <p className="text-[11px] text-ink-muted">
                  {formatReviewDate(review.created_at)}{edited ? " · edited" : ""}
                </p>
              </div>
              {showProduct && product && (
                product.id ? (
                  <Link href={`/products/${product.id}`} className="text-xs font-semibold text-jade-700 hover:text-jade-500">
                    {product.name} →
                  </Link>
                ) : (
                  <span className="text-xs font-medium text-ink-muted">{product.name}</span>
                )
              )}
            </div>

            {review.title && <h3 className="mt-4 font-serif text-xl font-semibold text-jade-950">{review.title}</h3>}
            {review.comment && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{review.comment}</p>}

            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] text-ink-muted">
              <RatingChip label="As described" rating={review.product_rating} />
              <RatingChip label="Communication" rating={review.communication_rating} />
              <RatingChip label="Fulfilment" rating={review.fulfilment_rating} />
              <RatingChip label="Packaging" rating={review.packaging_rating} />
              {review.delivery_rating && <RatingChip label="Delivery" rating={review.delivery_rating} />}
            </div>

            {review.vendor_reply && review.vendor_reply_status === "published" && (
              <div className="mt-5 rounded-xl border-l-4 border-gold-300 bg-gold-50/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gold-600">Store response</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{review.vendor_reply}</p>
                {review.vendor_replied_at && (
                  <p className="mt-1 text-[10px] text-ink-muted">Replied {formatReviewDate(review.vendor_replied_at)}</p>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end border-t border-jade-900/10 pt-3">
              <ReviewReportButton reviewId={review.id} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RatingChip({ label, rating }: { label: string; rating: number }) {
  return (
    <span className="rounded-full border border-jade-900/10 bg-jade-50 px-2.5 py-1">
      {label} <strong className="ml-1 text-jade-950">{rating}/5</strong>
    </span>
  );
}

function ratingStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

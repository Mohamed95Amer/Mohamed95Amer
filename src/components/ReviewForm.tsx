"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ExistingReview {
  overall_rating: number;
  product_rating: number;
  communication_rating: number;
  fulfilment_rating: number;
  packaging_rating: number;
  delivery_rating: number | null;
  title: string | null;
  comment: string | null;
  editable_until: string;
}

interface FormState {
  overallRating: number;
  productRating: number;
  communicationRating: number;
  fulfilmentRating: number;
  packagingRating: number;
  deliveryRating: number | null;
  title: string;
  comment: string;
}

export function ReviewForm({
  reservationId,
  existing,
}: {
  reservationId: string;
  existing?: ExistingReview | null;
}) {
  const router = useRouter();
  const editable = !existing || Date.parse(existing.editable_until) > Date.now();
  const [form, setForm] = useState<FormState>({
    overallRating: existing?.overall_rating ?? 5,
    productRating: existing?.product_rating ?? 5,
    communicationRating: existing?.communication_rating ?? 5,
    fulfilmentRating: existing?.fulfilment_rating ?? 5,
    packagingRating: existing?.packaging_rating ?? 5,
    deliveryRating: existing?.delivery_rating ?? null,
    title: existing?.title ?? "",
    comment: existing?.comment ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/reviews", {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId,
        ...form,
        title: form.title.trim() || null,
        comment: form.comment.trim() || null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      const labels: Record<string, string> = {
        not_a_completed_purchase: "Only completed purchases can be reviewed.",
        review_window_closed: "The 14-day editing window has closed.",
        review_already_exists: "This purchase has already been reviewed.",
      };
      setMessage(labels[body.error] ?? "Could not save your review. Please check the fields and try again.");
      return;
    }

    setMessage(existing ? "Review updated." : "Thank you—your verified review is now published.");
    router.refresh();
  }

  if (!editable) {
    return (
      <div className="rounded-xl bg-jade-50 p-4 text-sm text-ink-muted">
        Your verified review is published. The 14-day editing window has ended.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <RatingField label="Overall store experience (delivery excluded)" value={form.overallRating} onChange={(value) => value && set("overallRating", value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <RatingField label="Product as described" value={form.productRating} onChange={(value) => value && set("productRating", value)} compact />
        <RatingField label="Seller communication" value={form.communicationRating} onChange={(value) => value && set("communicationRating", value)} compact />
        <RatingField label="Fulfilment speed" value={form.fulfilmentRating} onChange={(value) => value && set("fulfilmentRating", value)} compact />
        <RatingField label="Packaging & presentation" value={form.packagingRating} onChange={(value) => value && set("packagingRating", value)} compact />
        <RatingField label="Delivery company (optional)" value={form.deliveryRating} onChange={(value) => set("deliveryRating", value)} compact optional />
      </div>
      <div>
        <label className="label" htmlFor="review-title">Review title (optional)</label>
        <input id="review-title" className="input mt-1" maxLength={120} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="A clear summary of your experience" />
      </div>
      <div>
        <label className="label" htmlFor="review-comment">Your review (optional)</label>
        <textarea id="review-comment" className="input mt-1 min-h-32" minLength={10} maxLength={2000} value={form.comment} onChange={(event) => set("comment", event.target.value)} placeholder="What went well, and what should the store improve?" />
        <p className="mt-1 text-[11px] text-ink-muted">Do not include phone numbers, addresses or payment information.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : existing ? "Update review" : "Publish verified review"}</button>
        {message && <p className="text-xs text-ink-muted" role="status">{message}</p>}
      </div>
    </form>
  );
}

function RatingField({
  label,
  value,
  onChange,
  compact = false,
  optional = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  compact?: boolean;
  optional?: boolean;
}) {
  return (
    <fieldset>
      <legend className={compact ? "text-xs font-medium text-jade-950" : "font-serif text-lg font-semibold text-jade-950"}>{label}</legend>
      <div className="mt-1.5 flex items-center gap-1" aria-label={label}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={`text-2xl leading-none transition hover:scale-110 ${rating <= (value ?? 0) ? "text-gold-400" : "text-jade-900/15"}`}
            aria-label={`${rating} out of 5`}
            aria-pressed={value === rating}
            onClick={() => onChange(rating)}
          >
            ★
          </button>
        ))}
        {optional && value !== null && (
          <button type="button" className="ml-2 text-[11px] text-ink-muted underline" onClick={() => onChange(null)}>Clear</button>
        )}
      </div>
    </fieldset>
  );
}

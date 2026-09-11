import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { getLatestTick } from "@/lib/gold-price/service";
import {
  calculateReservationValue,
  formatDubaiDate,
  formatSignedPercent,
  isActiveLockStatus,
  isPurchaseStatus,
  isReservationActive,
  reservationStatusLabel,
  type PriceSnapshotForInsight,
} from "@/lib/gold-insights";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ReviewForm } from "@/components/ReviewForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ReservationDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const [{ data: r }, latestTick] = await Promise.all([
    admin
      .from("reservations")
      .select("*, product:products(name, karat, weight_grams), snapshot:order_price_snapshots(*)")
      .eq("id", params.id)
      .single(),
    getLatestTick(),
  ]);
  if (!r) return notFound();
  if (r.customer_user_id !== user.id) return notFound();

  const { data: existingReview } = await admin
    .from("reviews")
    .select("overall_rating, product_rating, communication_rating, fulfilment_rating, packaging_rating, delivery_rating, title, comment, editable_until")
    .eq("reservation_id", r.id)
    .maybeSingle();

  const product = r.product as unknown as { name: string; karat: number; weight_grams: number } | null;
  const snapArr = r.snapshot as unknown as Array<Record<string, number | string>> | null;
  const snap = Array.isArray(snapArr) ? snapArr[0] : (snapArr as unknown as Record<string, number | string> | null);
  const currentRate = Number(latestTick?.price_per_gram_24k_aed ?? 0);
  const insight = snap && currentRate > 0
    ? calculateReservationValue(snap as unknown as PriceSnapshotForInsight, currentRate)
    : null;
  const active = isReservationActive(r.status, r.expires_at);
  const lapsedLock = isActiveLockStatus(r.status) && !active;
  const tracked = isPurchaseStatus(r.status) || active;
  const difference = insight?.differenceAed ?? 0;

  return (
    <div className="container-pro max-w-4xl py-10 sm:py-14">
      <Link href="/account" className="text-sm font-semibold text-jade-700 hover:text-jade-500">← Back to your history</Link>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-jade-600">Reservation details</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{product?.name ?? "Gold item"}</h1>
          <p className="mt-1 text-xs text-ink-muted">Reference {r.id}</p>
        </div>
        <GoldPriceBadge compact />
      </div>

      <div className="card mt-7 grid gap-4 p-6 text-sm sm:grid-cols-3">
        <div><span className="label">Status</span><span className="pill mt-2 border-jade-900/10 bg-jade-50">{lapsedLock ? "Price lock expired" : reservationStatusLabel(r.status)}</span></div>
        <div><span className="label">Item</span><p className="mt-2 text-jade-950">{product?.karat}K · {product?.weight_grams}g · quantity {r.quantity}</p></div>
        <div><span className="label">Price lock</span><p className="mt-2 text-jade-950">{lapsedLock ? "Ended" : "Until"} {formatDubaiDate(r.expires_at, true)}</p></div>
      </div>

      {insight && tracked && (
        <div className="mt-6 overflow-hidden rounded-2xl bg-jade-950 p-6 text-white shadow-lift sm:p-8">
          <p className="eyebrow text-gold-200">Market-linked update</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div><p className="text-xs text-white/50">Locked total</p><p className="mt-1 font-serif text-2xl tabular-nums">{formatAed(Number(snap?.total_price_aed))}</p></div>
            <div><p className="text-xs text-white/50">Comparable value now</p><p className="mt-1 font-serif text-2xl tabular-nums text-gold-200">{formatAed(insight.currentComparableTotalAed)}</p></div>
            <div><p className="text-xs text-white/50">{difference >= 0 ? "Advantage vs today" : "Change vs today"}</p><p className="mt-1 font-serif text-2xl tabular-nums">{difference > 0 ? "+" : ""}{formatAed(difference)}</p></div>
          </div>
          <p className="mt-5 border-t border-white/10 pt-4 text-sm text-white/60">
            The 24K reference moved {formatSignedPercent(insight.goldRateChangePercent)} from your captured rate of {formatAed(Number(snap?.gold_price_per_gram_24k_aed))}/g to {formatAed(currentRate)}/g.
          </p>
        </div>
      )}

      {snap && (
        <div className="card mt-6 p-6">
          <h2 className="font-serif text-xl">Locked price breakdown</h2>
          <p className="mt-1 text-xs text-ink-muted">Captured server-side and never rewritten by later market moves.</p>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-muted">Gold value</dt>
            <dd className="text-right">{formatAed(Number(snap.gold_value_aed))}</dd>
            <dt className="text-ink-muted">Making</dt>
            <dd className="text-right">
              {Number(snap.making_charge_discount_percent ?? 0) > 0 && (
                <span className="mr-2 text-ink-muted line-through">
                  {formatAed(Number(snap.original_making_charge ?? snap.making_charge))}
                </span>
              )}
              {formatAed(Number(snap.making_charge))}
            </dd>
            {Number(snap.certificate_fee ?? 0) > 0 && (
              <>
                <dt className="text-ink-muted">Certificate / assay</dt>
                <dd className="text-right">{formatAed(Number(snap.certificate_fee))}</dd>
              </>
            )}
            <dt className="text-ink-muted">Stone</dt>
            <dd className="text-right">{formatAed(Number(snap.stone_value))}</dd>
            <dt className="text-ink-muted">Vendor premium</dt>
            <dd className="text-right">{formatAed(Number(snap.vendor_premium))}</dd>
            <dt className="text-ink-muted">Platform fee</dt>
            <dd className="text-right">{formatAed(Number(snap.platform_fee))}</dd>
            <dt className="text-ink-muted">Delivery</dt>
            <dd className="text-right">{formatAed(Number(snap.delivery_fee))}</dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-medium">{formatAed(Number(snap.total_price_aed))}</dd>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Locked gold price: {formatAed(Number(snap.gold_price_per_gram_24k_aed))}/g 24K ·
            tick fetched {formatDubaiDate(snap.gold_price_fetched_at as string, true)}
          </p>
        </div>
      )}
      {r.status === "paid" && (
        <section id="review" className="card mt-6 p-6 sm:p-8">
          <p className="eyebrow text-jade-600">Verified purchase</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">
            {existingReview ? "Your review" : "Rate your store experience"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Your store rating covers the product and seller. Delivery is scored separately so a courier issue does not unfairly reduce the jeweller&apos;s rating.
          </p>
          <div className="mt-6">
            <ReviewForm reservationId={r.id} existing={existingReview} />
          </div>
        </section>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-muted">The current comparison updates only the gold component and holds the captured making, certificate or assay, stone, premium and fee amounts constant. It is not an appraisal, resale offer or financial advice.</p>
    </div>
  );
}

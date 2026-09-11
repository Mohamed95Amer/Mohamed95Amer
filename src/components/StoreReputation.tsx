import {
  storeBadges,
  type StoreBadge,
  type VendorReputation,
} from "@/lib/reputation";

export function StoreRating({
  reputation,
  compact = false,
}: {
  reputation: VendorReputation | null | undefined;
  compact?: boolean;
}) {
  if (!reputation || reputation.reviewCount === 0 || reputation.averageRating === null) {
    return <span className="text-xs text-ink-muted">No verified ratings yet</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${compact ? "text-[11px]" : "text-sm"}`}
      aria-label={`${reputation.averageRating.toFixed(1)} out of 5 from ${reputation.reviewCount} verified ${reputation.reviewCount === 1 ? "review" : "reviews"}`}
    >
      <span className="text-gold-500" aria-hidden="true">★</span>
      <strong className="tabular-nums text-jade-950">{reputation.averageRating.toFixed(1)}</strong>
      <span className="text-ink-muted">({reputation.reviewCount})</span>
      <span className="font-medium text-jade-700">Verified purchases</span>
    </span>
  );
}

export function StoreBadges({
  reputation,
  compact = false,
  limit,
}: {
  reputation: VendorReputation | null | undefined;
  compact?: boolean;
  limit?: number;
}) {
  if (!reputation) return null;
  const badges = storeBadges(reputation).slice(0, limit);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <StoreBadgePill key={badge.key} badge={badge} compact={compact} />
      ))}
    </div>
  );
}

function StoreBadgePill({ badge, compact }: { badge: StoreBadge; compact: boolean }) {
  const tone = badge.tone === "gold"
    ? "border-gold-300/60 bg-gold-50 text-gold-600"
    : badge.tone === "jade"
      ? "border-jade-300/60 bg-jade-50 text-jade-700"
      : "border-jade-900/10 bg-bone-soft text-ink-muted";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wide ${tone} ${
        compact ? "gap-1 px-2 py-0.5 text-[9px]" : "gap-1.5 px-2.5 py-1 text-[10px]"
      }`}
      title={badge.description}
    >
      <span aria-hidden="true">{badge.symbol}</span>
      {badge.label}
    </span>
  );
}

export function ReputationOverview({ reputation }: { reputation: VendorReputation }) {
  const metrics = [
    ["Product as described", reputation.productRating],
    ["Communication", reputation.communicationRating],
    ["Fulfilment", reputation.fulfilmentRating],
    ["Packaging", reputation.packagingRating],
    ["Delivery", reputation.deliveryRating],
  ] as const;

  return (
    <section className="card overflow-hidden">
      <div className="grid gap-6 p-6 sm:grid-cols-[0.7fr_1.3fr] sm:p-8">
        <div>
          <p className="eyebrow text-jade-600">Verified buyer rating</p>
          {reputation.averageRating === null ? (
            <>
              <p className="mt-3 font-serif text-3xl font-semibold text-jade-950">New on Get Gold</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">No completed buyer has rated this store yet.</p>
            </>
          ) : (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-serif text-5xl font-semibold tabular-nums text-jade-950">{reputation.averageRating.toFixed(1)}</span>
                <span className="mb-1 text-sm text-ink-muted">out of 5</span>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{reputation.reviewCount} verified {reputation.reviewCount === 1 ? "review" : "reviews"}</p>
            </>
          )}
          <div className="mt-4"><StoreBadges reputation={reputation} /></div>
        </div>

        <dl className="space-y-3">
          {metrics.map(([label, rating]) => (
            <div key={label} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-xs">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="h-1.5 overflow-hidden rounded-full bg-jade-900/10">
                <div className="h-full rounded-full bg-gold-400" style={{ width: `${((rating ?? 0) / 5) * 100}%` }} />
              </dd>
              <dd className="text-right font-semibold tabular-nums text-jade-950">{rating?.toFixed(1) ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid border-t border-jade-900/10 bg-jade-50/60 sm:grid-cols-3">
        <PerformanceMetric
          label="Average response"
          value={formatResponseTime(reputation.avgResponseMinutes)}
          detail={reputation.responseCount > 0 ? `${reputation.responseRatePercent ?? 0}% response rate` : "Building history"}
        />
        <PerformanceMetric
          label="Fulfilment rate"
          value={reputation.fulfilmentRatePercent === null ? "—" : `${reputation.fulfilmentRatePercent}%`}
          detail={`${reputation.resolvedOrderCount} resolved ${reputation.resolvedOrderCount === 1 ? "order" : "orders"} in 90 days`}
        />
        <PerformanceMetric
          label="Adjusted rating"
          value={reputation.adjustedRating === null ? "—" : reputation.adjustedRating.toFixed(2)}
          detail="Weighted to prevent one-review winners"
        />
      </div>
    </section>
  );
}

function PerformanceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-jade-900/10 p-4 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-jade-950">{value}</p>
      <p className="mt-0.5 text-[10px] text-ink-muted">{detail}</p>
    </div>
  );
}

function formatResponseTime(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 1_440) return `${(minutes / 60).toFixed(minutes < 120 ? 1 : 0)} hr`;
  return `${(minutes / 1_440).toFixed(1)} days`;
}

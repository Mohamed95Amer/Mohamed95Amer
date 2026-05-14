"use client";

import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { formatAed } from "@/lib/pricing/calc";

export function GoldPriceBadge({ compact = false }: { compact?: boolean }) {
  const { tick, isFresh, ageSeconds, staleAfterSeconds, loading } = useLiveGoldPrice();

  if (loading && !tick) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-bone-deep bg-bone-soft px-3 py-1.5 text-xs text-ink-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-bone-deep" />
        Loading gold price…
      </div>
    );
  }

  if (!tick) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-signal-err/30 bg-signal-err/10 px-3 py-1.5 text-xs text-signal-err">
        <span className="h-2 w-2 rounded-full bg-signal-err" />
        Gold price unavailable
      </div>
    );
  }

  const showStale = !isFresh;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        showStale
          ? "border-signal-warn/30 bg-signal-warn/10 text-signal-warn"
          : "border-bone-deep bg-bone-soft text-ink"
      }`}
      title={`Source: ${tick.source} · Stale after ${staleAfterSeconds}s`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          showStale ? "bg-signal-warn animate-pulse" : "bg-signal-ok"
        }`}
      />
      <span className="font-medium">
        24K {formatAed(Number(tick.price_per_gram_24k_aed))}/g
      </span>
      {!compact && (
        <span className="text-ink-muted">
          {showStale ? "Price updating…" : `Updated ${ageSeconds}s ago`}
        </span>
      )}
    </div>
  );
}

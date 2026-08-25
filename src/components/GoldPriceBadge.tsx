"use client";

import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { formatAed } from "@/lib/pricing/calc";

/**
 * The live 24K rate.
 *
 * Customers need to see that the number is live rather than a figure someone
 * typed in last week, so the badge states the cadence outright and counts down
 * to the next refresh. When a quote does age past the point we would sell
 * against it, that is shown too — quietly claiming "live" over a stale number
 * is the one thing this component must never do.
 */
export function GoldPriceBadge({ compact = false }: { compact?: boolean }) {
  const { tick, isFresh, ageSeconds, staleAfterSeconds, refreshIntervalSeconds, loading } =
    useLiveGoldPrice();

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

  const stale = !isFresh;
  // Seconds until the next refresh lands, floored at 0 while one is in flight.
  const nextIn = Math.max(0, refreshIntervalSeconds - ageSeconds);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        stale
          ? "border-signal-warn/30 bg-signal-warn/10 text-signal-warn"
          : "border-bone-deep bg-bone-soft text-ink"
      }`}
      title={
        stale
          ? `Last quote is ${ageSeconds}s old — older than the ${staleAfterSeconds}s limit we price against.`
          : `Source: ${tick.source} · refreshed every ${refreshIntervalSeconds}s · updated ${ageSeconds}s ago`
      }
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {!stale && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-ok opacity-70" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            stale ? "animate-pulse bg-signal-warn" : "bg-signal-ok"
          }`}
        />
      </span>

      <span className="font-semibold tabular-nums">
        24K {formatAed(Number(tick.price_per_gram_24k_aed))}/g
      </span>

      {!compact && (
        <span className="text-ink-muted">
          {stale ? (
            <>Refreshing — quote is {ageSeconds}s old</>
          ) : (
            <>
              Live · updates every {refreshIntervalSeconds}s
              <span className="ml-1 tabular-nums opacity-70">({nextIn}s)</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

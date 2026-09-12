"use client";

import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { formatAed } from "@/lib/pricing/calc";
import { quoteRecency, secondsUntilNextRefresh } from "@/lib/time";

/**
 * The live 24K rate.
 *
 * Customers need to see that the number is live rather than a figure someone
 * typed in last week, so the badge states the cadence outright and counts down
 * to the next refresh. When a quote does age past the point we would sell
 * against it, that is shown too — quietly claiming "live" over a stale number
 * is the one thing this component must never do.
 */
export function GoldPriceBadge({
  compact = false,
  tone = "light",
}: {
  compact?: boolean;
  tone?: "light" | "dark";
}) {
  const { tick, isFresh, ageSeconds, staleAfterSeconds, refreshIntervalSeconds, loading } =
    useLiveGoldPrice();

  if (loading && !tick) {
    return (
      <div aria-live="polite" className={`inline-flex min-w-[11rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        tone === "dark" ? "border-white/15 bg-white/10 text-white/70" : "border-jade-900/10 bg-jade-50 text-ink-muted"
      }`}>
        <span className={`h-2 w-2 animate-pulse rounded-full ${tone === "dark" ? "bg-white/50" : "bg-jade-200"}`} />
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
  const nextIn = secondsUntilNextRefresh(ageSeconds, refreshIntervalSeconds);
  const recency = quoteRecency(ageSeconds);
  const shell = stale
    ? "border-gold-300/35 bg-gold-50 text-gold-600"
    : tone === "dark"
      ? "border-white/15 bg-white/10 text-white"
      : "border-jade-200 bg-jade-50 text-jade-900";
  const secondary = tone === "dark" && !stale ? "text-white/65" : "text-ink-muted";

  return (
    <div
      aria-live="polite"
      className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border px-3 py-1.5 text-xs ${shell}`}
      title={
        stale
          ? `Last quote was updated ${recency}; this is beyond the ${staleAfterSeconds}s pricing limit.`
          : `Source: ${tick.source} · refreshed every ${refreshIntervalSeconds}s · updated ${recency}`
      }
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {!stale && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${
            tone === "dark" ? "bg-gold-300" : "bg-signal-ok"
          }`} />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            stale ? "animate-pulse bg-gold-500" : tone === "dark" ? "bg-gold-300" : "bg-signal-ok"
          }`}
        />
      </span>

      <span className="font-semibold tabular-nums">
        24K {formatAed(Number(tick.price_per_gram_24k_aed))}/g
      </span>

      {!compact && (
        <span className={secondary}>
          {stale ? (
            <>Refreshing quote · last update {recency}</>
          ) : (
            <>Live · refresh in <span className="tabular-nums">{nextIn}s</span></>
          )}
        </span>
      )}
    </div>
  );
}

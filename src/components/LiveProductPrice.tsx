"use client";

import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { computePrice, formatAed, goldRateForKarat } from "@/lib/pricing/calc";
import { quoteRecency } from "@/lib/time";

interface Props {
  karat: number;
  weightGrams: number;
  makingCharge: number;
  stoneValue: number;
  vendorPremium: number;
  platformFee?: number;
  deliveryFee?: number;
  showBreakdown?: boolean;
  showFooter?: boolean;
}

/**
 * Displays the live, advisory price for a product. The official price is
 * always recomputed server-side at reservation time — this component is
 * for the customer-facing display only.
 */
export function LiveProductPrice(props: Props) {
  const { tick, isFresh, ageSeconds, refreshIntervalSeconds, loading } = useLiveGoldPrice();

  if (loading || !tick || tick.price_per_gram_24k_aed === null) {
    return (
      <div className="text-ink-muted text-sm">
        {loading ? "Loading price…" : "Price unavailable"}
      </div>
    );
  }

  const breakdown = computePrice({
    pricePerGram24kAed: Number(tick.price_per_gram_24k_aed),
    karat: props.karat,
    weightGrams: props.weightGrams,
    makingCharge: props.makingCharge,
    stoneValue: props.stoneValue,
    vendorPremium: props.vendorPremium,
    platformFee: props.platformFee ?? 0,
    deliveryFee: props.deliveryFee ?? 0,
  });
  const liveRate24k = Number(tick.price_per_gram_24k_aed);
  const productGoldRate = goldRateForKarat(liveRate24k, props.karat);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="font-serif text-4xl font-semibold tracking-tight text-jade-950">{formatAed(breakdown.unitPriceAed)}</div>
        {isFresh ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-signal-ok">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-ok opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-ok" />
            </span>
            Live price
          </span>
        ) : (
          <span className="text-xs font-medium text-signal-warn">Price updating…</span>
        )}
      </div>
      {props.showBreakdown && (
        <div className="mt-5 border-t border-jade-900/10 pt-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-jade-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Live 24K market rate</p>
              <p className="mt-1 font-semibold tabular-nums text-jade-950">{formatAed(liveRate24k)}/g</p>
            </div>
            <div className="rounded-xl bg-gold-100/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">{props.karat}K metal rate</p>
              <p className="mt-1 font-semibold tabular-nums text-jade-950">{formatAed(productGoldRate)}/g</p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-jade-950">Price breakdown</h2>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Per item</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-2.5 text-sm text-ink-muted">
            <dt>Gold ({props.karat}K × {props.weightGrams}g)</dt>
            <dd className="text-right tabular-nums text-ink">{formatAed(breakdown.goldValueAed)}</dd>
            <dt>Making charge</dt>
            <dd className="text-right tabular-nums text-ink">{formatAed(breakdown.makingCharge)}</dd>
            {breakdown.stoneValue > 0 && (
              <>
                <dt>Stone value</dt>
                <dd className="text-right tabular-nums text-ink">{formatAed(breakdown.stoneValue)}</dd>
              </>
            )}
            {breakdown.vendorPremium > 0 && (
              <>
                <dt>Vendor premium</dt>
                <dd className="text-right tabular-nums text-ink">{formatAed(breakdown.vendorPremium)}</dd>
              </>
            )}
            <dt>GoldHub service fee</dt>
            <dd className="text-right tabular-nums text-ink">{formatAed(breakdown.platformFee)}</dd>
            <dt>Delivery fee</dt>
            <dd className="text-right tabular-nums text-ink">{formatAed(breakdown.deliveryFee)}</dd>
            <dt className="mt-1 border-t border-jade-900/10 pt-3 font-semibold text-jade-950">Total</dt>
            <dd className="mt-1 border-t border-jade-900/10 pt-3 text-right font-bold tabular-nums text-jade-950">
              {formatAed(breakdown.unitPriceAed)}
            </dd>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            The {props.karat}K rate is the metal-only value per gram. Making, stones, vendor premium,
            service, and delivery are listed separately above.
          </p>
        </div>
      )}
      {props.showFooter !== false && (
        <p className="mt-2 text-xs text-ink-muted">
          Follows the live 24K rate of {formatAed(liveRate24k)}/g, rechecked
          every {refreshIntervalSeconds}s ·{" "}
          {isFresh ? `updated ${quoteRecency(ageSeconds)}` : "refreshing now"}
        </p>
      )}
    </div>
  );
}

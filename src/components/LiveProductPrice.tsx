"use client";

import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { computePrice, formatAed } from "@/lib/pricing/calc";
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
        <dl className="mt-5 grid grid-cols-2 gap-y-2 border-t border-jade-900/10 pt-5 text-sm text-ink-muted">
          <dt>Gold value ({props.karat}K, {props.weightGrams}g)</dt>
          <dd className="text-right text-ink">{formatAed(breakdown.goldValueAed)}</dd>
          <dt>Making charge</dt>
          <dd className="text-right text-ink">{formatAed(breakdown.makingCharge)}</dd>
          {breakdown.stoneValue > 0 && (
            <>
              <dt>Stone value</dt>
              <dd className="text-right text-ink">{formatAed(breakdown.stoneValue)}</dd>
            </>
          )}
          {breakdown.vendorPremium > 0 && (
            <>
              <dt>Vendor premium</dt>
              <dd className="text-right text-ink">{formatAed(breakdown.vendorPremium)}</dd>
            </>
          )}
          {breakdown.platformFee > 0 && (
            <>
              <dt>Platform fee</dt>
              <dd className="text-right text-ink">{formatAed(breakdown.platformFee)}</dd>
            </>
          )}
          {breakdown.deliveryFee > 0 && (
            <>
              <dt>Delivery</dt>
              <dd className="text-right text-ink">{formatAed(breakdown.deliveryFee)}</dd>
            </>
          )}
        </dl>
      )}
      {props.showFooter !== false && (
        <p className="mt-2 text-xs text-ink-muted">
          Follows the live 24K rate of {formatAed(Number(tick.price_per_gram_24k_aed))}/g, rechecked
          every {refreshIntervalSeconds}s ·{" "}
          {isFresh ? `updated ${quoteRecency(ageSeconds)}` : "refreshing now"}
        </p>
      )}
    </div>
  );
}

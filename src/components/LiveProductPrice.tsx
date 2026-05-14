"use client";

import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { computePrice, formatAed } from "@/lib/pricing/calc";

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
  const { tick, isFresh, ageSeconds, loading } = useLiveGoldPrice();

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
      <div className="flex items-baseline gap-3">
        <div className="font-serif text-3xl text-ink">{formatAed(breakdown.unitPriceAed)}</div>
        {!isFresh && (
          <span className="text-xs text-signal-warn font-medium">Price updating…</span>
        )}
      </div>
      {props.showBreakdown && (
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm text-ink-muted">
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
          Based on 24K @ {formatAed(Number(tick.price_per_gram_24k_aed))}/g ·{" "}
          {isFresh ? `Updated ${ageSeconds}s ago` : "Refreshing…"}
        </p>
      )}
    </div>
  );
}

import type { PriceBreakdown } from "./calc";
import { round2 } from "./calc";

export interface GoldHubValueScore {
  score: number;
  label: string;
  premiumAboveGoldAed: number;
  premiumPercent: number;
  effectivePricePerGramAed: number;
}

/**
 * A simple, inspectable comparison of a listing's gold value with the costs
 * attached to that gold. One percentage point of non-gold premium removes one
 * point from the score, capped to 0–100.
 *
 * Stones and delivery are deliberately excluded: stones have their own value,
 * while delivery is an order/logistics cost. The service-fee portion charged on
 * a stone is excluded for the same reason. Active making discounts are already
 * reflected in `breakdown.makingCharge`.
 */
export function computeGoldHubValueScore(
  breakdown: PriceBreakdown,
  weightGrams: number,
): GoldHubValueScore | null {
  if (
    !Number.isFinite(breakdown.goldValueAed) ||
    breakdown.goldValueAed <= 0 ||
    !Number.isFinite(weightGrams) ||
    weightGrams <= 0
  ) {
    return null;
  }

  const goldComparableSubtotal = round2(
    breakdown.goldValueAed +
      breakdown.makingCharge +
      breakdown.certificateFee +
      breakdown.vendorPremium,
  );
  const comparableServiceFee = round2(
    goldComparableSubtotal * breakdown.platformFeeBps / 10_000,
  );
  const premiumAboveGoldAed = round2(
    breakdown.makingCharge +
      breakdown.certificateFee +
      breakdown.vendorPremium +
      comparableServiceFee,
  );
  const premiumPercent = round2(premiumAboveGoldAed / breakdown.goldValueAed * 100);
  const score = Math.max(0, Math.min(100, Math.round(100 - premiumPercent)));

  return {
    score,
    label: valueScoreLabel(score),
    premiumAboveGoldAed,
    premiumPercent,
    effectivePricePerGramAed: round2(
      (breakdown.goldValueAed + premiumAboveGoldAed) / weightGrams,
    ),
  };
}

export function valueScoreLabel(score: number): string {
  if (score >= 90) return "Excellent gold value";
  if (score >= 80) return "Strong gold value";
  if (score >= 70) return "Balanced gold value";
  return "Higher non-gold premium";
}

export function formatValuePercent(percent: number): string {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 1,
  }).format(percent);
}

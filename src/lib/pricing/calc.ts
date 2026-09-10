/**
 * Pricing calculations. These functions are used by the frontend ONLY for
 * display. The official price written to a reservation is recomputed
 * server-side in src/lib/pricing/server.ts using the same formula.
 */

export const KARAT_PURITY: Record<number, number> = {
  24: 1.0,
  22: 0.916,
  21: 0.875,
  18: 0.75,
};

export function karatPurityFactor(karat: number): number {
  const f = KARAT_PURITY[karat];
  if (f === undefined) throw new Error(`Unsupported karat: ${karat}`);
  return f;
}

/** The metal-only AED/g reference for a product's karat. */
export function goldRateForKarat(pricePerGram24kAed: number, karat: number): number {
  return round2(pricePerGram24kAed * karatPurityFactor(karat));
}

export interface PriceInputs {
  pricePerGram24kAed: number;
  karat: number;
  weightGrams: number;
  makingCharge: number;
  stoneValue: number;
  vendorPremium: number;
  platformFee: number;
  deliveryFee: number;
}

export interface PriceBreakdown {
  goldValueAed: number;       // pricePerGram24K * purity * weight
  makingCharge: number;
  stoneValue: number;
  vendorPremium: number;
  platformFee: number;
  deliveryFee: number;
  unitPriceAed: number;       // sum of the above, per unit
  purityFactor: number;
}

export function computePrice(inputs: PriceInputs): PriceBreakdown {
  const purity = karatPurityFactor(inputs.karat);
  const gold = inputs.pricePerGram24kAed * purity * inputs.weightGrams;
  const unit =
    gold +
    inputs.makingCharge +
    inputs.stoneValue +
    inputs.vendorPremium +
    inputs.platformFee +
    inputs.deliveryFee;
  return {
    goldValueAed: round2(gold),
    makingCharge: round2(inputs.makingCharge),
    stoneValue: round2(inputs.stoneValue),
    vendorPremium: round2(inputs.vendorPremium),
    platformFee: round2(inputs.platformFee),
    deliveryFee: round2(inputs.deliveryFee),
    unitPriceAed: round2(unit),
    purityFactor: purity,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatAed(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(n);
}

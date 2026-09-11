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
  platformFeeBps: number;
  deliveryFee: number;
}

export interface PriceBreakdown {
  goldValueAed: number;       // pricePerGram24K * purity * weight
  makingCharge: number;
  stoneValue: number;
  vendorPremium: number;
  merchandiseSubtotalAed: number;
  platformFee: number;
  platformFeeBps: number;
  deliveryFee: number;
  unitPriceAed: number;       // sum of the above, per unit
  purityFactor: number;
}

export function computePrice(inputs: PriceInputs): PriceBreakdown {
  const purity = karatPurityFactor(inputs.karat);
  if (!Number.isInteger(inputs.platformFeeBps) || inputs.platformFeeBps < 0 || inputs.platformFeeBps > 1000) {
    throw new Error("Platform fee must be between 0 and 1,000 basis points");
  }

  const goldValueAed = round2(inputs.pricePerGram24kAed * purity * inputs.weightGrams);
  const makingCharge = round2(inputs.makingCharge);
  const stoneValue = round2(inputs.stoneValue);
  const vendorPremium = round2(inputs.vendorPremium);
  const deliveryFee = round2(inputs.deliveryFee);
  const merchandiseSubtotalAed = round2(goldValueAed + makingCharge + stoneValue + vendorPremium);
  const platformFee = round2(merchandiseSubtotalAed * inputs.platformFeeBps / 10_000);
  const unitPriceAed = round2(merchandiseSubtotalAed + platformFee + deliveryFee);

  return {
    goldValueAed,
    makingCharge,
    stoneValue,
    vendorPremium,
    merchandiseSubtotalAed,
    platformFee,
    platformFeeBps: inputs.platformFeeBps,
    deliveryFee,
    unitPriceAed,
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

export function formatBasisPoints(bps: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}

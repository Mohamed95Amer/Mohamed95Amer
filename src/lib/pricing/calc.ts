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
  makingChargeDiscountPercent: number;
  makingChargeOfferEndsAt: string | null;
  certificateFee: number;
  stoneValue: number;
  vendorPremium: number;
  platformFeeBps: number;
  deliveryFee: number;
  pricedAt?: number;
}

export interface PriceBreakdown {
  goldValueAed: number;       // pricePerGram24K * purity * weight
  makingCharge: number;       // effective charge after any active promotion
  makingChargeOriginal: number;
  makingChargeDiscountAed: number;
  makingChargeDiscountPercent: number;
  makingChargeOfferEndsAt: string | null;
  certificateFee: number;
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
  if (
    !Number.isInteger(inputs.makingChargeDiscountPercent) ||
    inputs.makingChargeDiscountPercent < 0 ||
    inputs.makingChargeDiscountPercent > 100
  ) {
    throw new Error("Making charge discount must be between 0 and 100 percent");
  }

  const goldValueAed = round2(inputs.pricePerGram24kAed * purity * inputs.weightGrams);
  const makingChargeOriginal = round2(inputs.makingCharge);
  const offerActive = makingChargeOfferIsActive(
    inputs.makingChargeDiscountPercent,
    inputs.makingChargeOfferEndsAt,
    inputs.pricedAt,
  );
  const makingChargeDiscountPercent = offerActive ? inputs.makingChargeDiscountPercent : 0;
  const makingChargeDiscountAed = round2(makingChargeOriginal * makingChargeDiscountPercent / 100);
  const makingCharge = round2(makingChargeOriginal - makingChargeDiscountAed);
  const certificateFee = round2(inputs.certificateFee);
  const stoneValue = round2(inputs.stoneValue);
  const vendorPremium = round2(inputs.vendorPremium);
  const deliveryFee = round2(inputs.deliveryFee);
  const merchandiseSubtotalAed = round2(
    goldValueAed + makingCharge + certificateFee + stoneValue + vendorPremium,
  );
  const platformFee = round2(merchandiseSubtotalAed * inputs.platformFeeBps / 10_000);
  const unitPriceAed = round2(merchandiseSubtotalAed + platformFee + deliveryFee);

  return {
    goldValueAed,
    makingCharge,
    makingChargeOriginal,
    makingChargeDiscountAed,
    makingChargeDiscountPercent,
    makingChargeOfferEndsAt: offerActive ? inputs.makingChargeOfferEndsAt : null,
    certificateFee,
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

export function makingChargeOfferIsActive(
  discountPercent: number,
  endsAt: string | null,
  pricedAt = Date.now(),
): boolean {
  if (discountPercent <= 0) return false;
  if (!endsAt) return true;
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > pricedAt;
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

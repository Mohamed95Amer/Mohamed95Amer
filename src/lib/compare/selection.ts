import { computePrice, type PriceBreakdown } from "@/lib/pricing/calc";

export type CompareSort = "total" | "making";
export type CompareFulfilment = "delivery" | "pickup";

export interface CompareCriteria {
  category: string;
  karat: number;
  minWeight: number;
  maxWeight: number;
  budget: number;
  sort: CompareSort;
  fulfilment: CompareFulfilment;
}

export interface CompareListing {
  id: string;
  name: string;
  category: string;
  karat: number;
  weight_grams: number | string;
  making_charge: number | string;
  making_charge_discount_percent: number | string;
  making_charge_offer_ends_at: string | null;
  certificate_fee: number | string;
  stone_value: number | string;
  vendor_rate_adjustment_per_gram: number | string | null;
  assay_fineness: number | string | null;
  vat_rate_bps: number | string;
  images: unknown;
  vendor: { id: string; business_name: string; emirate: string };
  deliveryFeeAed: number;
}

export interface PricedCompareListing {
  listing: CompareListing;
  breakdown: PriceBreakdown;
}

export function priceCompareListings(
  listings: CompareListing[],
  rate24k: number,
  platformFeeBps: number,
  criteria?: CompareCriteria,
): PricedCompareListing[] {
  if (!Number.isFinite(rate24k) || rate24k <= 0) return [];
  const priced: PricedCompareListing[] = [];
  for (const listing of listings) {
    const weight = Number(listing.weight_grams);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (criteria && (listing.category !== criteria.category || listing.karat !== criteria.karat
      || weight < criteria.minWeight || weight > criteria.maxWeight)) continue;
    try {
      const breakdown = computePrice({
        pricePerGram24kAed: rate24k,
        karat: listing.karat,
        weightGrams: weight,
        makingCharge: Number(listing.making_charge),
        makingChargeDiscountPercent: Number(listing.making_charge_discount_percent),
        makingChargeOfferEndsAt: listing.making_charge_offer_ends_at,
        certificateFee: Number(listing.certificate_fee),
        stoneValue: Number(listing.stone_value),
        vendorPremium: 0,
        vendorRateAdjustmentPerGram: Number(listing.vendor_rate_adjustment_per_gram ?? 0),
        assayFineness: listing.assay_fineness == null ? null : Number(listing.assay_fineness),
        platformFeeBps,
        deliveryFee: criteria?.fulfilment === "pickup" ? 0 : listing.deliveryFeeAed,
        vatRateBps: Number(listing.vat_rate_bps),
      });
      if (!Number.isFinite(breakdown.unitPriceAed)) continue;
      if (criteria && breakdown.unitPriceAed > criteria.budget) continue;
      priced.push({ listing, breakdown });
    } catch {
      // A malformed listing must not break the entire comparison page.
    }
  }
  return priced;
}

/** One best-priced item per shop makes the four result cards genuinely cross-store. */
export function rankCompareListings(rows: PricedCompareListing[], sort: CompareSort): PricedCompareListing[] {
  const sorted = [...rows].sort((a, b) => {
    const primary = sort === "making"
      ? a.breakdown.makingCharge - b.breakdown.makingCharge
      : a.breakdown.unitPriceAed - b.breakdown.unitPriceAed;
    return primary || a.breakdown.unitPriceAed - b.breakdown.unitPriceAed || a.listing.id.localeCompare(b.listing.id);
  });
  const seen = new Set<string>();
  return sorted.filter(({ listing }) => {
    if (seen.has(listing.vendor.id) || seen.size >= 4) return false;
    seen.add(listing.vendor.id);
    return true;
  });
}

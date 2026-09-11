import { round2 } from "@/lib/pricing/calc";

export const PURCHASE_STATUSES = ["paid"] as const;
export const ACTIVE_LOCK_STATUSES = [
  "pending_vendor_confirmation",
  "payment_link_pending",
  "payment_pending",
] as const;

export interface PriceSnapshotForInsight {
  gold_price_per_gram_24k_aed: number | string;
  karat_purity_factor: number | string;
  weight_grams: number | string;
  making_charge: number | string;
  certificate_fee: number | string;
  stone_value: number | string;
  vendor_premium: number | string;
  platform_fee: number | string;
  delivery_fee: number | string;
  quantity: number | string;
  gold_value_aed: number | string;
  total_price_aed: number | string;
}

export interface ReservationValueInsight {
  fineGoldGrams: number;
  lockedGoldValueAed: number;
  currentGoldValueAed: number;
  currentComparableTotalAed: number;
  differenceAed: number;
  goldRateChangePercent: number;
}

/**
 * Compare a server-snapshotted reservation with today's market-linked rate.
 * Non-gold components stay exactly as captured in the snapshot. This is a
 * like-for-like replacement estimate, never a claim about jewellery resale.
 */
export function calculateReservationValue(
  snapshot: PriceSnapshotForInsight,
  current24kRateAed: number,
): ReservationValueInsight {
  const quantity = Math.max(1, Number(snapshot.quantity));
  const purity = Number(snapshot.karat_purity_factor);
  const weight = Number(snapshot.weight_grams);
  const lockedRate = Number(snapshot.gold_price_per_gram_24k_aed);
  const fineGoldGrams = purity * weight * quantity;
  const lockedGoldValueAed = Number(snapshot.gold_value_aed) * quantity;
  const currentGoldValueAed = current24kRateAed * fineGoldGrams;
  const nonGoldPerUnit =
    Number(snapshot.making_charge) +
    Number(snapshot.certificate_fee) +
    Number(snapshot.stone_value) +
    Number(snapshot.vendor_premium) +
    Number(snapshot.platform_fee) +
    Number(snapshot.delivery_fee);
  const currentComparableTotalAed = currentGoldValueAed + nonGoldPerUnit * quantity;
  const lockedTotal = Number(snapshot.total_price_aed);

  return {
    fineGoldGrams: round3(fineGoldGrams),
    lockedGoldValueAed: round2(lockedGoldValueAed),
    currentGoldValueAed: round2(currentGoldValueAed),
    currentComparableTotalAed: round2(currentComparableTotalAed),
    differenceAed: round2(currentComparableTotalAed - lockedTotal),
    goldRateChangePercent: lockedRate > 0 ? round2(((current24kRateAed / lockedRate) - 1) * 100) : 0,
  };
}

export function calculateGoldScenario(
  historical24kRateAed: number,
  current24kRateAed: number,
  grams: number,
  purityFactor: number,
) {
  const safeGrams = Math.max(0, grams);
  const historicalValueAed = historical24kRateAed * safeGrams * purityFactor;
  const currentValueAed = current24kRateAed * safeGrams * purityFactor;
  return {
    historicalValueAed: round2(historicalValueAed),
    currentValueAed: round2(currentValueAed),
    differenceAed: round2(currentValueAed - historicalValueAed),
    changePercent:
      historicalValueAed > 0
        ? round2(((currentValueAed / historicalValueAed) - 1) * 100)
        : 0,
  };
}

export function isPurchaseStatus(status: string): boolean {
  return (PURCHASE_STATUSES as readonly string[]).includes(status);
}

export function isActiveLockStatus(status: string): boolean {
  return (ACTIVE_LOCK_STATUSES as readonly string[]).includes(status);
}

export function isReservationActive(status: string, expiresAt: string, now = Date.now()): boolean {
  const expiry = new Date(expiresAt).getTime();
  return isActiveLockStatus(status) && Number.isFinite(expiry) && expiry > now;
}

export function reservationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_vendor_confirmation: "Awaiting vendor",
    payment_link_pending: "Payment link pending",
    payment_pending: "Payment pending",
    paid: "Purchased",
    cancelled: "Cancelled",
    expired: "Expired",
    refunded: "Refunded",
    rejected_by_vendor: "Vendor declined",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatDubaiDate(value: string, includeTime = false): string {
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

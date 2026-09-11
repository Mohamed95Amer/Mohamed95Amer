export interface VendorReputationRow {
  vendor_id: string;
  vendor_created_at: string;
  review_count: number | string;
  average_rating: number | string | null;
  adjusted_rating: number | string | null;
  product_rating: number | string | null;
  communication_rating: number | string | null;
  fulfilment_rating: number | string | null;
  packaging_rating: number | string | null;
  delivery_rating: number | string | null;
  response_eligible_order_count: number | string;
  response_count: number | string;
  response_rate_percent: number | string | null;
  avg_response_minutes: number | string | null;
  resolved_order_count: number | string;
  fulfilled_order_count: number | string;
  fulfilment_rate_percent: number | string | null;
  vendor_cancellation_rate_percent: number | string | null;
  moderated_incident_count_90d: number | string;
}

export interface VendorReputation {
  vendorId: string;
  vendorCreatedAt: string;
  reviewCount: number;
  averageRating: number | null;
  adjustedRating: number | null;
  productRating: number | null;
  communicationRating: number | null;
  fulfilmentRating: number | null;
  packagingRating: number | null;
  deliveryRating: number | null;
  responseEligibleOrderCount: number;
  responseCount: number;
  responseRatePercent: number | null;
  avgResponseMinutes: number | null;
  resolvedOrderCount: number;
  fulfilledOrderCount: number;
  fulfilmentRatePercent: number | null;
  vendorCancellationRatePercent: number | null;
  moderatedIncidentCount90d: number;
}

export type StoreBadgeKey =
  | "top_rated"
  | "fast_responder"
  | "reliable_fulfilment"
  | "new_verified";

export interface StoreBadge {
  key: StoreBadgeKey;
  label: string;
  symbol: string;
  description: string;
  tone: "gold" | "jade" | "neutral";
}

export interface PublicReview {
  id: string;
  overall_rating: number;
  product_rating: number;
  communication_rating: number;
  fulfilment_rating: number;
  packaging_rating: number;
  delivery_rating: number | null;
  title: string | null;
  comment: string | null;
  customer_display_name: string;
  created_at: string;
  updated_at: string;
  editable_until?: string;
  vendor_reply: string | null;
  vendor_replied_at: string | null;
  vendor_reply_status: string;
  product?: { id?: string; name: string } | Array<{ id?: string; name: string }> | null;
}

export const PUBLIC_REVIEW_SELECT =
  "id, overall_rating, product_rating, communication_rating, fulfilment_rating, packaging_rating, delivery_rating, title, comment, customer_display_name, created_at, updated_at, vendor_reply, vendor_replied_at, vendor_reply_status, product:products(id, name)";

export const REPUTATION_THRESHOLDS = {
  topRated: {
    minimumReviews: 20,
    adjustedRating: 4.7,
    fulfilmentRatePercent: 95,
    maximumVendorCancellationPercent: 2,
  },
  fastResponder: {
    minimumResponses: 5,
    responseRatePercent: 90,
    maximumAverageMinutes: 120,
  },
  reliableFulfilment: {
    minimumResolvedOrders: 20,
    fulfilmentRatePercent: 95,
    maximumVendorCancellationPercent: 2,
  },
  newVerified: {
    maximumAgeDays: 180,
    maximumReviews: 19,
  },
} as const;

export function normalizeReputation(row: VendorReputationRow): VendorReputation {
  return {
    vendorId: row.vendor_id,
    vendorCreatedAt: row.vendor_created_at,
    reviewCount: numeric(row.review_count) ?? 0,
    averageRating: numeric(row.average_rating),
    adjustedRating: numeric(row.adjusted_rating),
    productRating: numeric(row.product_rating),
    communicationRating: numeric(row.communication_rating),
    fulfilmentRating: numeric(row.fulfilment_rating),
    packagingRating: numeric(row.packaging_rating),
    deliveryRating: numeric(row.delivery_rating),
    responseEligibleOrderCount: numeric(row.response_eligible_order_count) ?? 0,
    responseCount: numeric(row.response_count) ?? 0,
    responseRatePercent: numeric(row.response_rate_percent),
    avgResponseMinutes: numeric(row.avg_response_minutes),
    resolvedOrderCount: numeric(row.resolved_order_count) ?? 0,
    fulfilledOrderCount: numeric(row.fulfilled_order_count) ?? 0,
    fulfilmentRatePercent: numeric(row.fulfilment_rate_percent),
    vendorCancellationRatePercent: numeric(row.vendor_cancellation_rate_percent),
    moderatedIncidentCount90d: numeric(row.moderated_incident_count_90d) ?? 0,
  };
}

export function reputationMap(rows: VendorReputationRow[] | null | undefined) {
  return new Map((rows ?? []).map((row) => {
    const reputation = normalizeReputation(row);
    return [reputation.vendorId, reputation] as const;
  }));
}

export function storeBadges(reputation: VendorReputation): StoreBadge[] {
  const badges: StoreBadge[] = [];
  const top = REPUTATION_THRESHOLDS.topRated;
  const fast = REPUTATION_THRESHOLDS.fastResponder;
  const reliable = REPUTATION_THRESHOLDS.reliableFulfilment;
  const ageDays = Math.max(
    0,
    (Date.now() - Date.parse(reputation.vendorCreatedAt)) / 86_400_000,
  );

  const isTopRated =
    reputation.reviewCount >= top.minimumReviews &&
    (reputation.adjustedRating ?? 0) >= top.adjustedRating &&
    (reputation.fulfilmentRatePercent ?? 0) >= top.fulfilmentRatePercent &&
    (reputation.vendorCancellationRatePercent ?? 100) <= top.maximumVendorCancellationPercent &&
    reputation.moderatedIncidentCount90d === 0;

  if (isTopRated) {
    badges.push({
      key: "top_rated",
      label: "Top Rated Store",
      symbol: "★",
      description: "Excellent adjusted rating and seller performance, maintained over time.",
      tone: "gold",
    });
  }

  if (
    reputation.responseCount >= fast.minimumResponses &&
    (reputation.responseRatePercent ?? 0) >= fast.responseRatePercent &&
    (reputation.avgResponseMinutes ?? Number.POSITIVE_INFINITY) <= fast.maximumAverageMinutes
  ) {
    badges.push({
      key: "fast_responder",
      label: "Fast Responder",
      symbol: "↗",
      description: "Usually responds within two hours and answers at least 90% of reservations.",
      tone: "jade",
    });
  }

  if (
    reputation.resolvedOrderCount >= reliable.minimumResolvedOrders &&
    (reputation.fulfilmentRatePercent ?? 0) >= reliable.fulfilmentRatePercent &&
    (reputation.vendorCancellationRatePercent ?? 100) <= reliable.maximumVendorCancellationPercent
  ) {
    badges.push({
      key: "reliable_fulfilment",
      label: "Reliable Fulfilment",
      symbol: "✓",
      description: "At least 95% fulfilment with very few seller cancellations.",
      tone: "jade",
    });
  }

  if (
    !isTopRated &&
    ageDays <= REPUTATION_THRESHOLDS.newVerified.maximumAgeDays &&
    reputation.reviewCount <= REPUTATION_THRESHOLDS.newVerified.maximumReviews
  ) {
    badges.push({
      key: "new_verified",
      label: "New Verified Store",
      symbol: "◆",
      description: "Recently joined GoldHub and passed business verification.",
      tone: "neutral",
    });
  }

  return badges;
}

export function oneRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function numeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

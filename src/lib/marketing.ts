import { getServiceSupabase } from "@/lib/supabase/server";
import { round2 } from "@/lib/pricing/calc";

export const MARKETING_ASSET_BUCKET = "marketing-assets";

export interface MarketplacePromotion {
  id: string;
  title: string;
  serviceFeeDiscountPercent: number;
  deliveryDiscountPercent: number;
  startsAt: string;
  endsAt: string;
}

export interface ActiveSiteBanner {
  id: string;
  title: string;
  body: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  placement: "home_top" | "home_middle" | "marketplace_top" | "vendors_top";
}

export async function getActiveMarketplacePromotion(now = new Date()): Promise<MarketplacePromotion | null> {
  const iso = now.toISOString();
  const { data } = await getServiceSupabase()
    .from("marketplace_promotions")
    .select("id, title, service_fee_discount_percent, delivery_discount_percent, starts_at, ends_at")
    .is("cancelled_at", null)
    .lte("starts_at", iso)
    .gt("ends_at", iso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    serviceFeeDiscountPercent: Number(data.service_fee_discount_percent),
    deliveryDiscountPercent: Number(data.delivery_discount_percent),
    startsAt: data.starts_at,
    endsAt: data.ends_at,
  };
}

export function applyEventFeeDiscount(basisPoints: number, discountPercent: number): number {
  // Round in the customer's favour when a percentage produces a fraction of
  // a basis point, so the advertised discount is never silently under-delivered.
  return Math.max(0, Math.floor(basisPoints * (100 - discountPercent) / 100));
}

export function applyEventDeliveryDiscount(deliveryFee: number, discountPercent: number): number {
  return round2(Math.max(0, deliveryFee) * (100 - discountPercent) / 100);
}

export async function getActiveSiteBanners(placements: ActiveSiteBanner["placement"][]): Promise<ActiveSiteBanner[]> {
  if (placements.length === 0) return [];
  const iso = new Date().toISOString();
  const { data } = await getServiceSupabase()
    .from("site_banners")
    .select("id, title, body, image_path, image_alt, cta_label, cta_href, placement")
    .in("placement", placements)
    .is("cancelled_at", null)
    .lte("starts_at", iso)
    .gt("ends_at", iso)
    .order("display_order")
    .order("created_at", { ascending: false });
  return (data ?? []).map((banner) => ({
    id: banner.id,
    title: banner.title,
    body: banner.body,
    imagePath: banner.image_path,
    imageAlt: banner.image_alt,
    ctaLabel: banner.cta_label,
    ctaHref: banner.cta_href,
    placement: banner.placement as ActiveSiteBanner["placement"],
  }));
}

export async function getActiveVendorPromotionMap(vendorIds: string[]): Promise<Map<string, { id: string; label: string; endsAt: string }>> {
  if (vendorIds.length === 0) return new Map();
  const iso = new Date().toISOString();
  const { data } = await getServiceSupabase()
    .from("vendor_promotions")
    .select("id, vendor_id, label, ends_at")
    .in("vendor_id", vendorIds)
    .is("cancelled_at", null)
    .lte("starts_at", iso)
    .gt("ends_at", iso)
    .order("created_at", { ascending: false });
  const result = new Map<string, { id: string; label: string; endsAt: string }>();
  for (const row of data ?? []) {
    if (!result.has(row.vendor_id)) result.set(row.vendor_id, { id: row.id, label: row.label, endsAt: row.ends_at });
  }
  return result;
}

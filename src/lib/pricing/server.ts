import { getServiceSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getLatestTick, isFresh } from "@/lib/gold-price/service";
import { refreshInBand } from "@/lib/gold-price/refresh-on-read";
import { computePrice, type PriceBreakdown } from "./calc";
import type { FulfilmentMethod } from "@/lib/fulfilment";

export interface OfficialPriceResult {
  product: {
    id: string;
    vendor_id: string;
    name: string;
    karat: number;
    weight_grams: number;
    making_charge: number;
    making_charge_discount_percent: number;
    making_charge_offer_ends_at: string | null;
    certificate_fee: number;
    stone_value: number;
    vendor_premium: number;
    quantity: number;
  };
  tick: {
    id: number;
    price_per_gram_24k_aed: number;
    fetched_at: string;
    status: "ok" | "degraded" | "failed";
  };
  settings: { platform_fee_bps: number; delivery_fee_aed: number; stale_price_seconds: number };
  breakdown: PriceBreakdown;
  totalPriceAed: number;
  isFresh: boolean;
}

/**
 * Compute the OFFICIAL price for a product, server-side, using the latest tick.
 * This is the only function that should produce a price that's persisted or
 * shown to the customer at the moment of reservation.
 */
export async function computeOfficialPriceForProduct(
  productId: string,
  quantity: number,
  fulfilmentMethod: FulfilmentMethod,
): Promise<OfficialPriceResult> {
  const supabase = getServiceSupabase();

  const { data: product, error: prodErr } = await supabase
    .from("products")
    .select(
      "id, vendor_id, name, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, quantity, product_status",
    )
    .eq("id", productId)
    .single();
  if (prodErr || !product) throw new Error("Product not found");
  if (product.product_status !== "approved") {
    throw new Error("Product is not available for purchase");
  }
  if (quantity < 1 || quantity > product.quantity) {
    throw new Error("Requested quantity exceeds available stock");
  }

  const { data: settings, error: setErr } = await supabase
    .from("platform_settings")
    .select("platform_fee_bps, delivery_fee_aed, stale_price_seconds")
    .eq("id", true)
    .single();
  if (setErr || !settings) throw new Error("Platform settings missing");

  const staleSeconds = settings.stale_price_seconds ?? env.stalePriceSeconds();

  // Refresh before pricing if the newest tick has aged out. Without this a
  // reservation attempted after a quiet period would fail the freshness gate
  // below purely because nothing had polled the price endpoint recently.
  let tick = await getLatestTick();
  if (!tick || !isFresh(tick.fetched_at, staleSeconds)) {
    await refreshInBand();
    tick = (await getLatestTick()) ?? tick;
  }
  if (!tick) throw new Error("No live gold price available");

  const fresh = isFresh(tick.fetched_at, staleSeconds);

  const breakdown = computePrice({
    pricePerGram24kAed: Number(tick.price_per_gram_24k_aed),
    karat: product.karat,
    weightGrams: Number(product.weight_grams),
    makingCharge: Number(product.making_charge),
    makingChargeDiscountPercent: Number(product.making_charge_discount_percent),
    makingChargeOfferEndsAt: product.making_charge_offer_ends_at,
    certificateFee: Number(product.certificate_fee),
    stoneValue: Number(product.stone_value),
    vendorPremium: Number(product.vendor_premium),
    platformFeeBps: Number(settings.platform_fee_bps),
    deliveryFee: fulfilmentMethod === "delivery" ? Number(settings.delivery_fee_aed) : 0,
  });

  const totalPriceAed = Math.round(breakdown.unitPriceAed * quantity * 100) / 100;

  return {
    product,
    tick: {
      id: tick.id,
      price_per_gram_24k_aed: Number(tick.price_per_gram_24k_aed),
      fetched_at: tick.fetched_at,
      status: tick.status,
    },
    settings,
    breakdown,
    totalPriceAed,
    isFresh: fresh,
  };
}

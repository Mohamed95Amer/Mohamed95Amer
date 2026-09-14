import { getLatestTick } from "@/lib/gold-price/service";
import { computePrice, formatAed } from "@/lib/pricing/calc";
import { getServiceSupabase } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notifications/server";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { dubaiTodayIso } from "@/lib/time";

export async function processDuePriceAlerts(limit = 100) {
  const admin = getServiceSupabase(); const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const [{ data: alerts, error }, { data: settings }, tick] = await Promise.all([
    admin.from("price_alerts").select("id, user_id, product_id, target_total_aed, notify_on_making_offer, last_evaluated_at").eq("active", true).or(`last_evaluated_at.is.null,last_evaluated_at.lt.${cutoff}`).limit(limit),
    admin.from("platform_settings").select("platform_fee_bps, delivery_fee_aed, listing_fresh_days").eq("id", true).maybeSingle(),
    getLatestTick(),
  ]);
  if (error || !tick || !alerts?.length) return { evaluated: 0, triggered: 0, error: error?.message ?? null };
  const productIds = [...new Set(alerts.map((alert) => alert.product_id))];
  const { data: products } = await admin.from("products").select("id, name, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, product_status, data_quality_status, quantity, inventory_confirmed_at, vendors!inner(verification_status, license_expiry_date)").in("id", productIds).eq("product_status", "approved").eq("data_quality_status", "valid").eq("vendors.verification_status", "approved").gte("vendors.license_expiry_date", dubaiTodayIso()).gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45)));
  const productMap = new Map((products ?? []).map((product) => [product.id, product])); let triggered = 0; const evaluatedAt = new Date().toISOString();
  for (const alert of alerts) {
    const product = productMap.get(alert.product_id); if (!product || product.product_status !== "approved" || product.data_quality_status !== "valid") { await admin.from("price_alerts").update({ active: false, last_evaluated_at: evaluatedAt }).eq("id", alert.id); continue; }
    const breakdown = computePrice({ pricePerGram24kAed: Number(tick.price_per_gram_24k_aed), karat: Number(product.karat), weightGrams: Number(product.weight_grams), makingCharge: Number(product.making_charge), makingChargeDiscountPercent: Number(product.making_charge_discount_percent), makingChargeOfferEndsAt: product.making_charge_offer_ends_at, certificateFee: Number(product.certificate_fee), stoneValue: Number(product.stone_value), vendorPremium: Number(product.vendor_premium), platformFeeBps: Number(settings?.platform_fee_bps ?? 100), deliveryFee: Number(settings?.delivery_fee_aed ?? 0) });
    const targetReached = alert.target_total_aed != null && breakdown.unitPriceAed <= Number(alert.target_total_aed); const makingOffer = alert.notify_on_making_offer && breakdown.makingChargeDiscountPercent > 0;
    if (targetReached) { triggered += 1; await notifyUser({ userId: alert.user_id, kind: "price_alert", title: `${product.name} reached your target`, body: `The current indicative total is ${formatAed(breakdown.unitPriceAed)}. Open the listing to confirm availability and lock a fresh server price.`, href: `/products/${product.id}`, dedupeKey: `target:${alert.id}:${Number(alert.target_total_aed).toFixed(2)}` }); }
    if (makingOffer) { triggered += 1; await notifyUser({ userId: alert.user_id, kind: "price_alert", title: `${breakdown.makingChargeDiscountPercent}% off making`, body: `${product.name} now has a making-charge promotion. The live total can continue moving with gold.`, href: `/products/${product.id}`, dedupeKey: `making:${alert.id}:${breakdown.makingChargeDiscountPercent}:${breakdown.makingChargeOfferEndsAt ?? "open"}` }); }
    await admin.from("price_alerts").update({ last_evaluated_at: evaluatedAt, ...(targetReached || makingOffer ? { last_triggered_at: evaluatedAt, last_triggered_total_aed: breakdown.unitPriceAed } : {}) }).eq("id", alert.id);
  }
  return { evaluated: alerts.length, triggered, error: null };
}

import { getServiceSupabase } from "@/lib/supabase/server";
import { applyEventFeeDiscount, getActiveMarketplacePromotion } from "@/lib/marketing";

export interface CustomerFeeOffer {
  effectiveBps: number;
  standardBps: number;
  discountPercent: number;
  remainingDiscountedOrders: number;
  eventDiscountPercent: number;
  eventDeliveryDiscountPercent: number;
  eventPromotionId: string | null;
  eventPromotionTitle: string | null;
  eventPromotionEndsAt: string | null;
}

interface CustomerFeeQuoteRow {
  effective_bps: number;
  standard_bps: number;
  discount_percent: number;
  remaining_discounted_orders: number;
}

export async function getCustomerFeeOffer(customerUserId?: string | null): Promise<CustomerFeeOffer> {
  const promotionPromise = getActiveMarketplacePromotion();
  let base: Omit<CustomerFeeOffer, "eventDiscountPercent" | "eventDeliveryDiscountPercent" | "eventPromotionId" | "eventPromotionTitle" | "eventPromotionEndsAt">;
  if (!customerUserId) {
    base = { effectiveBps: 50, standardBps: 100, discountPercent: 50, remainingDiscountedOrders: 3 };
  } else {
    const { data: rawData, error } = await getServiceSupabase().rpc("customer_fee_quote", { p_customer_user_id: customerUserId }).single();
    const data = rawData as CustomerFeeQuoteRow | null;
    base = error || !data
      ? { effectiveBps: 100, standardBps: 100, discountPercent: 0, remainingDiscountedOrders: 0 }
      : {
          effectiveBps: Number(data.effective_bps), standardBps: Number(data.standard_bps),
          discountPercent: Number(data.discount_percent), remainingDiscountedOrders: Number(data.remaining_discounted_orders),
        };
  }
  const promotion = await promotionPromise;
  return {
    ...base,
    effectiveBps: applyEventFeeDiscount(base.effectiveBps, promotion?.serviceFeeDiscountPercent ?? 0),
    eventDiscountPercent: promotion?.serviceFeeDiscountPercent ?? 0,
    eventDeliveryDiscountPercent: promotion?.deliveryDiscountPercent ?? 0,
    eventPromotionId: promotion?.id ?? null,
    eventPromotionTitle: promotion?.title ?? null,
    eventPromotionEndsAt: promotion?.endsAt ?? null,
  };
}

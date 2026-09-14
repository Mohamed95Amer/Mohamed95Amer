import { getServiceSupabase } from "@/lib/supabase/server";

export interface CustomerFeeOffer {
  effectiveBps: number;
  standardBps: number;
  discountPercent: number;
  remainingDiscountedOrders: number;
}

interface CustomerFeeQuoteRow {
  effective_bps: number;
  standard_bps: number;
  discount_percent: number;
  remaining_discounted_orders: number;
}

export async function getCustomerFeeOffer(customerUserId?: string | null): Promise<CustomerFeeOffer> {
  if (!customerUserId) return { effectiveBps: 50, standardBps: 100, discountPercent: 50, remainingDiscountedOrders: 3 };
  const { data: rawData, error } = await getServiceSupabase().rpc("customer_fee_quote", { p_customer_user_id: customerUserId }).single();
  const data = rawData as CustomerFeeQuoteRow | null;
  if (error || !data) return { effectiveBps: 100, standardBps: 100, discountPercent: 0, remainingDiscountedOrders: 0 };
  return {
    effectiveBps: Number(data.effective_bps), standardBps: Number(data.standard_bps),
    discountPercent: Number(data.discount_percent), remainingDiscountedOrders: Number(data.remaining_discounted_orders),
  };
}

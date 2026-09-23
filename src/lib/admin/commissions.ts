import { vendorOrderStatus } from "@/lib/vendor-workspace";
export type CommissionOrder = {
  id: string;
  vendor_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  earned_at: string;
  is_demo: boolean;
  current_fee_model: boolean;
  has_snapshot: boolean;
  order_total_aed: number | null;
  fee_aed: number | null;
  delivery_credit_aed: number | null;
  expires_at?: string | null;
};
export type LedgerEntry = {
  id: string;
  vendor_id: string;
  kind: "receipt" | "credit" | "debit";
  amount_aed: number;
  note: string;
  reference: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};
export type CommissionVendor = {
  id: string;
  business_name: string;
  is_demo: boolean;
};
export const fils = (amount: number | string | null | undefined) =>
  Math.round(Number(amount ?? 0) * 100);
export const paidOrder = (o: CommissionOrder) =>
  o.payment_status === "paid" &&
  !["refunded", "cancelled", "expired", "rejected_by_vendor"].includes(
    o.status,
  );
export function summarizeCommissions(
  orders: CommissionOrder[],
  ledger: LedgerEntry[],
) {
  let sales = 0,
    earned = 0,
    deliveryCredits = 0,
    pending = 0,
    legacy = 0,
    missing = 0,
    paidCount = 0;
  for (const o of orders) {
    if (!o.has_snapshot) missing++;
    if (o.has_snapshot && !o.current_fee_model) legacy++;
    if (paidOrder(o)) {
      paidCount++;
      sales += fils(o.order_total_aed);
      if (o.current_fee_model) {
        earned += fils(o.fee_aed);
        deliveryCredits += fils(o.delivery_credit_aed);
      }
    } else if (
      o.current_fee_model &&
      [
        "pending_vendor_confirmation",
        "vendor_confirmed",
        "payment_pending",
        "payment_verification",
      ].includes(vendorOrderStatus(o))
    )
      pending += fils(o.fee_aed);
  }
  let received = 0,
    credits = 0,
    debits = 0;
  for (const entry of ledger) {
    if (entry.voided_at) continue;
    if (entry.kind === "receipt") received += fils(entry.amount_aed);
    if (entry.kind === "credit") credits += fils(entry.amount_aed);
    if (entry.kind === "debit") debits += fils(entry.amount_aed);
  }
  return {
    sales,
    earned,
    deliveryCredits,
    pending,
    legacy,
    missing,
    paidCount,
    received,
    credits,
    debits,
    balance: earned - deliveryCredits + debits - credits - received,
  };
}
export function dubaiDay(iso: string) {
  return new Date(Date.parse(iso) + 4 * 3600000).toISOString().slice(0, 10);
}
export function commissionTrend(
  orders: CommissionOrder[],
  days: number,
  now = Date.now(),
) {
  const today = Date.parse(
    dubaiDay(new Date(now).toISOString()) + "T00:00:00Z",
  );
  const bins = Array.from({ length: days }, (_, i) => ({
    day: new Date(today - (days - i - 1) * 86400000).toISOString().slice(0, 10),
    fee: 0,
    orders: 0,
  }));
  const lookup = new Map(bins.map((b) => [b.day, b]));
  for (const order of orders) {
    if (!paidOrder(order)) continue;
    const bin = lookup.get(dubaiDay(order.earned_at));
    if (bin) {
      bin.orders++;
      if (order.current_fee_model) bin.fee += fils(order.fee_aed);
    }
  }
  return bins;
}

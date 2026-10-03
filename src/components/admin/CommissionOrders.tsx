"use client";
import { useState } from "react";
import Link from "next/link";
import { paidOrder, fils, type CommissionOrder } from "@/lib/admin/commissions";
import { vendorOrderStatus, vendorStatus } from "@/lib/vendor-workspace";
import { money } from "./CommissionCards";
export function CommissionOrders({
  orders,
  arabic,
}: {
  orders: CommissionOrder[];
  arabic: boolean;
}) {
  const [limit, setLimit] = useState(25);
  const sorted = [...orders].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-semibold">
        {arabic ? "الطلبات الداعمة لهذا الحساب" : "Orders behind this account"}{" "}
        ({orders.length})
      </summary>
      <p className="mt-3 text-xs text-ink-muted">
        {arabic
          ? "الرسوم من الأسعار المحفوظة. الرسم المعلق ليس مستحقاً حتى تأكيد الدفع."
          : "Fees come from saved prices. Pending fees are not earned until payment is confirmed."}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              {[
                arabic ? "الطلب" : "Order",
                arabic ? "الحالة" : "Status",
                arabic ? "الإجمالي" : "Total",
                arabic ? "الرسم المحفوظ" : "Saved fee",
                arabic ? "المكتسب" : "Earned",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap p-3 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((o) => (
              <tr key={o.id} className="border-t border-bone-deep">
                <td className="p-3">
                  <Link
                    className="font-semibold text-jade-700 underline"
                    href={"/admin/orders/" + o.id}
                  >
                    {o.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td className="p-3">
                  {vendorStatus(vendorOrderStatus(o), arabic)}
                </td>
                <td className="whitespace-nowrap p-3">
                  {o.order_total_aed == null
                    ? "—"
                    : money(fils(o.order_total_aed))}
                </td>
                <td className="whitespace-nowrap p-3">
                  {!o.has_snapshot
                    ? arabic
                      ? "لقطة مفقودة"
                      : "Missing snapshot"
                    : !o.current_fee_model
                      ? arabic
                        ? "نظام سابق"
                        : "Legacy model"
                      : money(fils(o.fee_aed))}
                </td>
                <td className="whitespace-nowrap p-3">
                  {money(
                    paidOrder(o) && o.current_fee_model ? fils(o.fee_aed) : 0,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!orders.length && (
        <p className="mt-3 text-sm text-ink-muted">
          {arabic ? "لا توجد طلبات بعد." : "No orders yet."}
        </p>
      )}
      {limit < orders.length && (
        <button
          className="btn-ghost mt-4"
          onClick={() => setLimit((n) => n + 25)}
        >
          {arabic ? "عرض 25 طلباً إضافياً" : "Show 25 more orders"}
        </button>
      )}
    </details>
  );
}

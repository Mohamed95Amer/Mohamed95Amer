import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { formatDubaiDateTime } from "@/lib/presentation";
import Link from "next/link";
import { fulfilmentLabel } from "@/lib/fulfilment";
import { cookies } from "next/headers";
import { localizedStatusLabel } from "@/lib/localized-status";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const filters = await searchParams;
  const admin = getServiceSupabase();
  let q = admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, vendor_action_available_at, submitted_during_working_hours, vendor_confirmed_price_aed, vendor_price_confirmed_at, customer_price_accepted_at, payment_window_expires_at, transfer_submitted_at, payment_confirmed_at, payment_dispute_status, identity_verification_id, fulfilment_method, payment_method, payment_status, vendor:vendors(business_name), customer:profiles!reservations_customer_user_id_fkey(full_name), snapshot:order_price_snapshots(total_price_aed, platform_fee, platform_fee_bps, customer_fee_standard_bps, customer_fee_discount_percent, service_fee_event_discount_percent, delivery_fee, delivery_fee_before_event_discount, delivery_event_discount_percent, marketplace_promotion_title, vendor_rate_adjustment_aed, vat_rate_bps, vat_aed, quantity)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.filter === "disputed") q = q.eq("payment_dispute_status", "reported");
  else if (filters.filter) q = q.eq("status", filters.filter);
  const { data } = await q;
  return (
    <div dir={arabic ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">{t("Orders", "الطلبات")}</h2><p className="mt-1 text-sm text-ink-muted">{t("Monitor store confirmations, customer acceptance, direct-payment verification and fulfilment.", "تابع تأكيد المتجر وموافقة العميل والتحقق من الدفع المباشر والتسليم.")}</p><p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted">{t("Get Gold does not confirm Aani or bank transfers. Only the vendor can confirm cleared funds in its own account.", "لا يؤكد Get Gold تحويلات آني أو التحويلات البنكية. يؤكد المتجر وحده وصول المبلغ إلى حسابه.")}</p></div><div className="flex flex-wrap gap-2">{[["", t("All", "الكل")], ["disputed", t("Disputed", "متنازع عليه")], ["pending_vendor_confirmation", t("Awaiting vendor", "بانتظار المتجر")], ["vendor_confirmed", t("Awaiting customer", "بانتظار العميل")], ["payment_pending", t("Awaiting payment", "بانتظار الدفع")], ["payment_verification", t("Verify payment", "مراجعة الدفع")], ["payment_confirmed", t("Payment confirmed", "تم تأكيد الدفع")], ["preparing_order", t("Preparing", "جارٍ التجهيز")], ["completed", t("Completed", "مكتمل")], ["expired", t("Expired", "منتهي")]].map(([value, label]) => <Link key={value} href={value ? `/admin/orders?filter=${value}` : "/admin/orders"} className={`pill min-h-9 px-3 ${filters.filter === value || (!filters.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div></div>
      <div className="card mt-5 overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-start">{t("Customer", "العميل")}</th>
            <th className="px-4 py-2 text-start">{t("Vendor", "المتجر")}</th>
            <th className="px-4 py-2 text-end">{t("Qty", "الكمية")}</th>
            <th className="px-4 py-2 text-end">{t("Total", "الإجمالي")}</th>
            <th className="px-4 py-2 text-end">{t("Get Gold fee", "رسوم Get Gold")}</th>
            <th className="px-4 py-2 text-end">{t("Net settlement", "صافي التسوية")}</th>
            <th className="px-4 py-2 text-start">{t("Fulfilment", "التسليم")}</th>
            <th className="px-4 py-2 text-start">{t("Payment", "الدفع")}</th>
            <th className="px-4 py-2 text-start">{t("Identity", "الهوية")}</th>
            <th className="px-4 py-2 text-start">{t("Status", "الحالة")}</th>
            <th className="px-4 py-2 text-start">{t("Expires", "تنتهي")}</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((o) => {
            const c = o.customer as unknown as { full_name: string | null } | null;
            const v = o.vendor as unknown as { business_name: string } | null;
            type PriceSnapshot = { total_price_aed: number; platform_fee: number; platform_fee_bps: number; customer_fee_standard_bps: number | null; customer_fee_discount_percent: number | null; service_fee_event_discount_percent: number; delivery_fee: number; delivery_fee_before_event_discount: number | null; delivery_event_discount_percent: number; marketplace_promotion_title: string | null; vendor_rate_adjustment_aed: number | null; vat_rate_bps: number; vat_aed: number; quantity: number };
            const snap = o.snapshot as unknown as PriceSnapshot[] | PriceSnapshot | null;
            const estimateTotal = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
            const total = o.vendor_confirmed_price_aed ?? estimateTotal;
            const priceSnapshot = Array.isArray(snap) ? snap[0] : snap;
            const usesCurrentCustomerFee = priceSnapshot?.customer_fee_standard_bps != null;
            const customerServiceFee = Number(priceSnapshot?.platform_fee ?? 0) * Number(priceSnapshot?.quantity ?? o.quantity);
            const deliverySubsidy = Math.max(0, Number(priceSnapshot?.delivery_fee_before_event_discount ?? priceSnapshot?.delivery_fee ?? 0) - Number(priceSnapshot?.delivery_fee ?? 0));
            const netSettlement = customerServiceFee - deliverySubsidy;
            const deadline = o.payment_window_expires_at ? Date.parse(o.payment_window_expires_at) : null;
            const submitted = o.transfer_submitted_at ? Date.parse(o.transfer_submitted_at) : null;
            const confirmed = o.payment_confirmed_at ? Date.parse(o.payment_confirmed_at) : null;
            const timingAttention = Boolean(
              (deadline && submitted && submitted > deadline)
              || (deadline && !submitted && Date.now() > deadline && ["payment_pending", "expired"].includes(o.status))
              || (submitted && !confirmed && Date.now() - submitted > 24 * 60 * 60 * 1000)
              || (submitted && confirmed && confirmed - submitted > 24 * 60 * 60 * 1000),
            );
            return (
              <tr key={o.id} className="border-t border-bone-deep">
                <td className="px-4 py-2">{c?.full_name ?? "—"}</td>
                <td className="px-4 py-2">{v?.business_name ?? "—"}</td>
                <td className="px-4 py-2 text-end">{o.quantity}</td>
                <td className="px-4 py-2 text-end">{formatAed(total)}<span className="block text-[10px] text-ink-muted">{o.vendor_confirmed_price_aed != null ? `${t("Vendor confirmed · estimate", "أكد المتجر · التقدير")} ${formatAed(Number(estimateTotal))}` : t("Request estimate", "تقدير الطلب")}</span><span className="block text-[10px] text-ink-muted">{Number(priceSnapshot?.vat_rate_bps ?? 0) > 0 ? `${formatAed(Number(priceSnapshot?.vat_aed ?? 0))} ${t("VAT included", "ضريبة مشمولة")}` : t("VAT not charged", "الضريبة غير مطبقة")}</span></td>
                <td className="px-4 py-2 text-end">
                  {usesCurrentCustomerFee ? <>{formatAed(customerServiceFee)}<span className="block text-[10px] text-ink-muted">{Number(priceSnapshot?.platform_fee_bps ?? 0) / 100}%{Number(priceSnapshot?.customer_fee_discount_percent ?? 0) > 0 ? t(" · intro offer", " · عرض تمهيدي") : ""}{Number(priceSnapshot?.service_fee_event_discount_percent ?? 0) > 0 ? ` · ${priceSnapshot?.marketplace_promotion_title ?? t("event offer", "عرض موسمي")}` : ""}</span></> : <>{customerServiceFee > 0 ? formatAed(customerServiceFee) : t("Not charged", "غير مفروضة")}<span className="block text-[10px] text-ink-muted">{t("Legacy pricing · before customer fee", "تسعير قديم · قبل رسوم العميل")}</span></>}
                </td>
                <td className="px-4 py-2 text-end font-medium">{usesCurrentCustomerFee ? <>{formatAed(netSettlement)}{deliverySubsidy > 0 && <span className="block text-[10px] font-normal text-signal-ok">{t("after", "بعد خصم")} {formatAed(deliverySubsidy)} {t("vendor delivery credit", "رصيد توصيل للمتجر")}</span>}</> : <>—<span className="block text-[10px] font-normal text-ink-muted">{t("Not applicable to legacy pricing", "لا ينطبق على التسعير القديم")}</span></>}</td>
                <td className="px-4 py-2">{arabic ? o.fulfilment_method === "collection" ? "استلام من المتجر" : "توصيل" : fulfilmentLabel(o.fulfilment_method)}</td>
                <td className="px-4 py-2">{o.payment_method === "aani" ? t("Aani → store", "آني ← المتجر") : o.payment_method === "bank_transfer" ? t("Bank → store", "بنك ← المتجر") : o.payment_method === "pay_online" ? t("Online", "إلكتروني") : t("Direct to store", "مباشرة للمتجر")}<span className="block text-[10px] text-ink-muted">{localizedStatusLabel(o.payment_status, arabic)}</span>{o.payment_dispute_status === "reported" && <span className="mt-1 block text-[10px] font-semibold text-red-700">{t("Payment disputed", "الدفع محل نزاع")}</span>}{timingAttention && <span className="mt-1 block text-[10px] font-semibold text-amber-700">{t("Timing attention", "راجع المواعيد")}</span>}<Link className="mt-1 block text-[10px] font-semibold text-jade-700 underline" href={`/admin/orders/${o.id}`}>{t("View payment trail", "عرض سجل الدفع")}</Link></td>
                <td className="px-4 py-2 font-medium">{o.identity_verification_id ? t("✓ Verified", "✓ تم التحقق") : t("Legacy", "قديم")}</td>
                <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{localizedStatusLabel(o.status, arabic)}</span></td>
                <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(o.expires_at)}{!o.submitted_during_working_hours && o.status === "pending_vendor_confirmation" && <span className="block text-[10px] text-gold-700">{t("Opens", "يفتح")} {formatDubaiDateTime(o.vendor_action_available_at)}</span>}</td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={11} className="px-4 py-6 text-center text-ink-muted">{t("No orders.", "لا توجد طلبات.")}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

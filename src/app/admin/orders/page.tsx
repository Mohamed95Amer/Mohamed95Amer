import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import Link from "next/link";
import { fulfilmentLabel } from "@/lib/fulfilment";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const filters = await searchParams;
  const admin = getServiceSupabase();
  let q = admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, identity_verification_id, fulfilment_method, payment_method, payment_status, vendor:vendors(business_name), customer:profiles(full_name), snapshot:order_price_snapshots(total_price_aed, platform_fee, platform_fee_bps, customer_fee_discount_percent, quantity)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.filter) q = q.eq("status", filters.filter);
  const { data } = await q;
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">Reservations</h2><p className="mt-1 text-sm text-ink-muted">Monitor live locks, vendor decisions and completed purchases.</p></div><div className="flex flex-wrap gap-2">{[["", "All"], ["pending_vendor_confirmation", "Awaiting vendor"], ["payment_pending", "Payment pending"], ["paid", "Purchased"], ["expired", "Expired"], ["cancelled", "Cancelled"]].map(([value, label]) => <Link key={value} href={value ? `/admin/orders?filter=${value}` : "/admin/orders"} className={`pill min-h-9 px-3 ${filters.filter === value || (!filters.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div></div>
      <div className="card mt-5 overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">Customer</th>
            <th className="px-4 py-2 text-left">Vendor</th>
            <th className="px-4 py-2 text-right">Qty</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2 text-right">Get Gold fee</th>
            <th className="px-4 py-2 text-left">Fulfilment</th>
            <th className="px-4 py-2 text-left">Payment</th>
            <th className="px-4 py-2 text-left">Identity</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Expires</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((o) => {
            const c = o.customer as unknown as { full_name: string | null } | null;
            const v = o.vendor as unknown as { business_name: string } | null;
            const snap = o.snapshot as unknown as Array<{ total_price_aed: number; platform_fee: number; platform_fee_bps: number; customer_fee_discount_percent: number | null; quantity: number }> | { total_price_aed: number; platform_fee: number; platform_fee_bps: number; customer_fee_discount_percent: number | null; quantity: number } | null;
            const total = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
            const priceSnapshot = Array.isArray(snap) ? snap[0] : snap;
            const customerServiceFee = Number(priceSnapshot?.platform_fee ?? 0) * Number(priceSnapshot?.quantity ?? o.quantity);
            return (
              <tr key={o.id} className="border-t border-bone-deep">
                <td className="px-4 py-2">{c?.full_name ?? "—"}</td>
                <td className="px-4 py-2">{v?.business_name ?? "—"}</td>
                <td className="px-4 py-2 text-right">{o.quantity}</td>
                <td className="px-4 py-2 text-right">{formatAed(total)}</td>
                <td className="px-4 py-2 text-right">{formatAed(customerServiceFee)}<span className="block text-[10px] text-ink-muted">{Number(priceSnapshot?.customer_fee_discount_percent ?? 0) > 0 ? "50% off" : `${Number(priceSnapshot?.platform_fee_bps ?? 0) / 100}%`}</span></td>
                <td className="px-4 py-2">{fulfilmentLabel(o.fulfilment_method)}</td>
                <td className="px-4 py-2">{o.payment_method === "pay_online" ? "Online" : "Direct to store"}<span className="block text-[10px] text-ink-muted">{statusLabel(o.payment_status)}</span></td>
                <td className="px-4 py-2 font-medium">{o.identity_verification_id ? "✓ Verified" : "Legacy"}</td>
                <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(o.status)}</span></td>
                <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(o.expires_at)}</td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={10} className="px-4 py-6 text-center text-ink-muted">No orders.</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

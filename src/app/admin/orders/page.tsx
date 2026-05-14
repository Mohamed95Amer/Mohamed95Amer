import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: { filter?: string } }) {
  const admin = getServiceSupabase();
  let q = admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, vendor:vendors(business_name), customer:profiles(full_name), snapshot:order_price_snapshots(total_price_aed)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (searchParams.filter) q = q.eq("status", searchParams.filter);
  const { data } = await q;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">Customer</th>
            <th className="px-4 py-2 text-left">Vendor</th>
            <th className="px-4 py-2 text-right">Qty</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Expires</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((o) => {
            const c = o.customer as unknown as { full_name: string | null } | null;
            const v = o.vendor as unknown as { business_name: string } | null;
            const snap = o.snapshot as unknown as Array<{ total_price_aed: number }> | { total_price_aed: number } | null;
            const total = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
            return (
              <tr key={o.id} className="border-t border-bone-deep">
                <td className="px-4 py-2">{c?.full_name ?? "—"}</td>
                <td className="px-4 py-2">{v?.business_name ?? "—"}</td>
                <td className="px-4 py-2 text-right">{o.quantity}</td>
                <td className="px-4 py-2 text-right">{formatAed(total)}</td>
                <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{o.status}</span></td>
                <td className="px-4 py-2 text-ink-muted">{new Date(o.expires_at).toLocaleString()}</td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No orders.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

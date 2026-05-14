import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { VendorOrderActions } from "./VendorOrderActions";

export const dynamic = "force-dynamic";

export default async function VendorOrdersPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const { data: orders } = await admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, customer:profiles(full_name), product:products(name, karat, weight_grams), snapshot:order_price_snapshots(total_price_aed)",
    )
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: false });

  return (
    <div className="container-pro py-10">
      <h1 className="font-serif text-3xl">Orders</h1>
      <p className="text-sm text-ink-muted">Confirm or reject reservations before payment is requested.</p>
      <div className="card mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bone-soft text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Expires</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const product = o.product as unknown as { name: string; karat: number; weight_grams: number } | null;
              const customer = o.customer as unknown as { full_name: string | null } | null;
              const snap = o.snapshot as unknown as Array<{ total_price_aed: number }> | { total_price_aed: number } | null;
              const total = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
              return (
                <tr key={o.id} className="border-t border-bone-deep">
                  <td className="px-4 py-2">{customer?.full_name ?? "—"}</td>
                  <td className="px-4 py-2">{product?.name} · {product?.karat}K · {product?.weight_grams}g</td>
                  <td className="px-4 py-2 text-right">{o.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatAed(total)}</td>
                  <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{o.status}</span></td>
                  <td className="px-4 py-2 text-ink-muted">{new Date(o.expires_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    {o.status === "pending_vendor_confirmation" && (
                      <VendorOrderActions reservationId={o.id} />
                    )}
                  </td>
                </tr>
              );
            })}
            {(orders ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">No orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

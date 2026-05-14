import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = getServiceSupabase();
  const [
    pendingVendors, pendingProducts, pendingOrders, failedTicks, recentAudit,
  ] = await Promise.all([
    admin.from("vendors").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    admin.from("products").select("id", { count: "exact", head: true }).eq("product_status", "pending_approval"),
    admin.from("reservations").select("id", { count: "exact", head: true }).eq("status", "pending_vendor_confirmation"),
    admin.from("gold_price_ticks").select("id", { count: "exact", head: true }).neq("status", "ok"),
    admin.from("audit_logs").select("id, action, entity_type, entity_id, created_at, actor_role").order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Live gold price</p>
        <div className="mt-3"><GoldPriceBadge /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat href="/admin/vendors?filter=pending" label="Pending vendors" count={pendingVendors.count ?? 0} />
        <Stat href="/admin/products?filter=pending_approval" label="Pending products" count={pendingProducts.count ?? 0} />
        <Stat href="/admin/orders?filter=pending_vendor_confirmation" label="Pending orders" count={pendingOrders.count ?? 0} />
        <Stat href="/admin/gold-price" label="Non-ok ticks (24h)" count={failedTicks.count ?? 0} />
      </div>

      <div className="card p-6">
        <h2 className="font-serif text-xl">Recent audit events</h2>
        <ul className="mt-4 divide-y divide-bone-deep text-sm">
          {(recentAudit.data ?? []).map((e) => (
            <li key={e.id} className="py-2 flex items-center justify-between">
              <span><span className="text-ink-muted">{e.actor_role ?? "system"} ·</span> {e.action} <span className="text-ink-muted">on</span> {e.entity_type}/{e.entity_id ?? ""}</span>
              <span className="text-xs text-ink-muted">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
          {(recentAudit.data ?? []).length === 0 && <li className="py-3 text-ink-muted">No events yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function Stat({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link href={href} className="card p-5 hover:border-gold-300">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-2 font-serif text-3xl">{count}</div>
    </Link>
  );
}

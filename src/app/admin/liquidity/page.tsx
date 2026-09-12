import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime } from "@/lib/presentation";

export const dynamic = "force-dynamic";

interface LiquidityRow {
  vendor_id: string;
  approved_listings: number;
  live_listings: number;
  reservations_30d: number;
  request_offers_30d: number;
  visit_requests_30d: number;
  last_inventory_confirmation: string | null;
}

export default async function AdminLiquidityPage() {
  const admin = getServiceSupabase();
  const [{ data: rawRows }, { data: vendors }, openRequests, acceptedOffers, completedVisits] = await Promise.all([
    admin.from("vendor_liquidity_summary").select("*").order("reservations_30d", { ascending: false }),
    admin.from("vendors").select("id, business_name, emirate").eq("verification_status", "approved"),
    admin.from("buyer_requests").select("id", { count: "exact", head: true }).eq("status", "open").gt("expires_at", new Date().toISOString()),
    admin.from("buyer_request_offers").select("id", { count: "exact", head: true }).eq("status", "accepted").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
    admin.from("store_visit_requests").select("id", { count: "exact", head: true }).eq("status", "completed").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);
  const rows = (rawRows ?? []) as LiquidityRow[];
  const vendorNames = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor]));
  const totals = rows.reduce((sum, row) => ({ live: sum.live + Number(row.live_listings), reservations: sum.reservations + Number(row.reservations_30d), offers: sum.offers + Number(row.request_offers_30d), visits: sum.visits + Number(row.visit_requests_30d) }), { live: 0, reservations: 0, offers: 0, visits: 0 });

  return <div><p className="eyebrow text-jade-600">Marketplace flywheel</p><h2 className="mt-1 font-serif text-3xl text-jade-950">Supply and buyer intent</h2><p className="mt-2 max-w-3xl text-sm text-ink-muted">Watch current sellable inventory and the paths that turn demand into orders or store visits. Counts cover the last 30 days unless stated otherwise.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Metric label="Fresh live listings" value={totals.live} /><Metric label="Reservations" value={totals.reservations} /><Metric label="Open buyer requests" value={openRequests.count ?? 0} /><Metric label="Offers sent" value={totals.offers} /><Metric label="Accepted offers" value={acceptedOffers.count ?? 0} /><Metric label="Visit leads / completed" value={`${totals.visits} / ${completedVisits.count ?? 0}`} /></div><div className="card mt-6 overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-bone-soft text-ink-muted"><tr><th className="px-4 py-3 text-left">Store</th><th className="px-4 py-3 text-right">Live / approved</th><th className="px-4 py-3 text-right">Reservations</th><th className="px-4 py-3 text-right">Offers</th><th className="px-4 py-3 text-right">Visit leads</th><th className="px-4 py-3 text-left">Last stock check</th></tr></thead><tbody>{rows.map((row) => { const vendor = vendorNames.get(row.vendor_id); return <tr key={row.vendor_id} className="border-t border-bone-deep"><td className="px-4 py-3 font-medium">{vendor?.business_name ?? row.vendor_id}<span className="ml-2 text-xs font-normal text-ink-muted">{vendor?.emirate}</span></td><td className="px-4 py-3 text-right">{row.live_listings} / {row.approved_listings}</td><td className="px-4 py-3 text-right">{row.reservations_30d}</td><td className="px-4 py-3 text-right">{row.request_offers_30d}</td><td className="px-4 py-3 text-right">{row.visit_requests_30d}</td><td className="px-4 py-3 text-xs text-ink-muted">{row.last_inventory_confirmation ? formatDubaiDateTime(row.last_inventory_confirmation) : "Never"}</td></tr>; })}{rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No vendor metrics yet.</td></tr>}</tbody></table></div></div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="card p-5"><p className="label">{label}</p><p className="mt-2 font-serif text-3xl text-jade-950">{value}</p></div>;
}

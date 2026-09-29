import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime } from "@/lib/presentation";
import { cookies } from "next/headers";

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
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
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

  return <div dir={arabic ? "rtl" : "ltr"}>
    <p className="eyebrow text-jade-600">{t("Marketplace flywheel", "نشاط السوق")}</p><h2 className="mt-1 font-serif text-3xl text-jade-950">{t("Supply and buyer intent", "المخزون واهتمام المشترين")}</h2><p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("Watch current sellable inventory and the paths that turn demand into orders or store visits. Counts cover the last 30 days unless stated otherwise.", "تابع المنتجات المتاحة ومسارات تحويل الاهتمام إلى طلبات أو زيارات للمتاجر. تغطي الأرقام آخر 30 يوماً ما لم يُذكر خلاف ذلك.")}</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Metric label={t("Fresh live listings", "منتجات حديثة متاحة")} value={totals.live} /><Metric label={t("Reservations", "طلبات الشراء")} value={totals.reservations} /><Metric label={t("Open buyer requests", "طلبات عملاء مفتوحة")} value={openRequests.count ?? 0} /><Metric label={t("Offers sent", "عروض مرسلة")} value={totals.offers} /><Metric label={t("Accepted offers", "عروض مقبولة")} value={acceptedOffers.count ?? 0} /><Metric label={t("Visit leads / completed", "طلبات الزيارة / المكتملة")} value={`${totals.visits} / ${completedVisits.count ?? 0}`} /></div>
    <div className="card mt-6 overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-bone-soft text-ink-muted"><tr><th className="px-4 py-3 text-start">{t("Store", "المتجر")}</th><th className="px-4 py-3 text-end">{t("Live / approved", "متاح / معتمد")}</th><th className="px-4 py-3 text-end">{t("Requests", "الطلبات")}</th><th className="px-4 py-3 text-end">{t("Offers", "العروض")}</th><th className="px-4 py-3 text-end">{t("Visit leads", "طلبات الزيارة")}</th><th className="px-4 py-3 text-start">{t("Last stock check", "آخر مراجعة للمخزون")}</th></tr></thead><tbody>{rows.map((row) => { const vendor = vendorNames.get(row.vendor_id); return <tr key={row.vendor_id} className="border-t border-bone-deep"><td className="px-4 py-3 font-medium">{vendor?.business_name ?? row.vendor_id}<span className="ms-2 text-xs font-normal text-ink-muted">{vendor?.emirate}</span></td><td className="px-4 py-3 text-end">{row.live_listings} / {row.approved_listings}</td><td className="px-4 py-3 text-end">{row.reservations_30d}</td><td className="px-4 py-3 text-end">{row.request_offers_30d}</td><td className="px-4 py-3 text-end">{row.visit_requests_30d}</td><td className="px-4 py-3 text-xs text-ink-muted">{row.last_inventory_confirmation ? formatDubaiDateTime(row.last_inventory_confirmation) : t("Never", "لم يحدث")}</td></tr>; })}{rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">{t("No vendor metrics yet.", "لا توجد مؤشرات للمتاجر بعد.")}</td></tr>}</tbody></table></div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="card p-5"><p className="label">{label}</p><p className="mt-2 font-serif text-3xl text-jade-950">{value}</p></div>;
}

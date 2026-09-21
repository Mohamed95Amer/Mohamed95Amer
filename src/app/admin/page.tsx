import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import Link from "next/link";
import { formatDubaiDateTime, shortId, statusLabel } from "@/lib/presentation";
import { AdminDemoDataControl } from "@/components/AdminDemoDataControl";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = getServiceSupabase();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const labels = arabic ? { price: "سعر الذهب المباشر", pendingVendors: "متاجر بانتظار المراجعة", pendingDelivery: "شركات توصيل بانتظار المراجعة", pendingProducts: "منتجات بانتظار الاعتماد", pendingOrders: "طلبات بانتظار تأكيد المتجر", failed: "تحديثات غير سليمة (24 ساعة)", requests: "طلبات العملاء المفتوحة", support: "دعم الكتالوج", premium: "متاجر مميزة مباشرة", banners: "إعلانات مباشرة", campaigns: "حملات خصم مباشرة", audit: "آخر أحداث التدقيق", none: "لا توجد أحداث بعد." } : { price: "Live gold price", pendingVendors: "Pending vendors", pendingDelivery: "Pending delivery", pendingProducts: "Pending products", pendingOrders: "Pending orders", failed: "Non-ok ticks (24h)", requests: "Open buyer requests", support: "Catalogue support", premium: "Premium vendors live", banners: "Ad banners live", campaigns: "Discount campaigns live", audit: "Recent audit events", none: "No events yet." };
  const { data: platformSettings } = await admin.from("platform_settings").select("demo_data_visible").eq("id", true).maybeSingle();
  const [
    pendingVendors, pendingDeliveryCompanies, pendingProducts, pendingOrders, failedTicks, openBuyerRequests, catalogueRequests, activePremium, activeBanners, activeCampaigns, recentAudit,
  ] = await Promise.all([
    admin.from("vendors").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    admin.from("delivery_companies").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    admin.from("products").select("id", { count: "exact", head: true }).eq("product_status", "pending_approval"),
    admin.from("reservations").select("id", { count: "exact", head: true }).eq("status", "pending_vendor_confirmation"),
    admin.from("gold_price_ticks").select("id", { count: "exact", head: true }).neq("status", "ok").gte("fetched_at", new Date(Date.now() - 86_400_000).toISOString()),
    admin.from("buyer_requests").select("id", { count: "exact", head: true }).eq("status", "open").gt("expires_at", new Date().toISOString()),
    admin.from("catalogue_support_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "scheduled", "in_progress"]),
    admin.from("vendor_promotions").select("id", { count: "exact", head: true }).is("cancelled_at", null).lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()),
    admin.from("site_banners").select("id", { count: "exact", head: true }).is("cancelled_at", null).lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()),
    admin.from("marketplace_promotions").select("id", { count: "exact", head: true }).is("cancelled_at", null).lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()),
    admin.from("audit_logs").select("id, action, entity_type, entity_id, created_at, actor_role").order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="grid gap-6">
      <AdminDemoDataControl initialVisible={platformSettings?.demo_data_visible !== false} />
        <div className="card p-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{labels.price}</p>
        <div className="mt-3"><GoldPriceBadge /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="/admin/vendors?filter=pending" label={labels.pendingVendors} count={pendingVendors.count ?? 0} />
        <Stat href="/admin/delivery-companies?filter=pending" label={labels.pendingDelivery} count={pendingDeliveryCompanies.count ?? 0} />
        <Stat href="/admin/products?filter=pending_approval" label={labels.pendingProducts} count={pendingProducts.count ?? 0} />
        <Stat href="/admin/orders?filter=pending_vendor_confirmation" label={labels.pendingOrders} count={pendingOrders.count ?? 0} />
        <Stat href="/admin/gold-price" label={labels.failed} count={failedTicks.count ?? 0} />
        <Stat href="/admin/liquidity" label={labels.requests} count={openBuyerRequests.count ?? 0} />
        <Stat href="/admin/catalogue-support" label={labels.support} count={catalogueRequests.count ?? 0} />
        <Stat href="/admin/vendors" label={labels.premium} count={activePremium.count ?? 0} />
        <Stat href="/admin/marketing" label={labels.banners} count={activeBanners.count ?? 0} />
        <Stat href="/admin/marketing" label={labels.campaigns} count={activeCampaigns.count ?? 0} />
      </div>

      <div className="card p-6">
        <h2 className="font-serif text-xl">{labels.audit}</h2>
        <ul className="mt-4 divide-y divide-bone-deep text-sm">
          {(recentAudit.data ?? []).map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span><span className="text-ink-muted">{statusLabel(e.actor_role ?? "system")} ·</span> {e.action.replaceAll("_", " ")} <span className="text-ink-muted">on</span> {e.entity_type}/{shortId(e.entity_id)}</span>
              <span className="shrink-0 text-xs text-ink-muted">{formatDubaiDateTime(e.created_at)}</span>
            </li>
          ))}
          {(recentAudit.data ?? []).length === 0 && <li className="py-3 text-ink-muted">{labels.none}</li>}
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

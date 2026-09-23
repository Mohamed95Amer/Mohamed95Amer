import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { getCommissionData } from "@/lib/admin/data";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminDemoDataControl } from "@/components/AdminDemoDataControl";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { cookies } from "next/headers";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function AdminOverviewPage() {
  const profile = await requireAdmin(),
    db = getServiceSupabase();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const [data, vendors, products, delivery, settings] = await Promise.all([
    getCommissionData(),
    db
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "pending")
      .eq("is_demo", false),
    db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("product_status", "pending_approval")
      .eq("is_demo", false),
    db
      .from("delivery_companies")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "pending"),
    db
      .from("platform_settings")
      .select("demo_data_visible")
      .eq("id", true)
      .single(),
  ]);
  if ([vendors, products, delivery, settings].some((r) => r.error))
    throw new Error("Could not load administration overview");
  const actions = [
    {
      label: arabic ? "متاجر تنتظر الموافقة" : "Stores awaiting approval",
      count: vendors.count ?? 0,
      href: "/admin/vendors?filter=pending",
    },
    {
      label: arabic ? "منتجات للمراجعة" : "Products to review",
      count: products.count ?? 0,
      href: "/admin/products?filter=pending_approval",
    },
    {
      label: arabic ? "شركاء توصيل للمراجعة" : "Delivery partners to review",
      count: delivery.count ?? 0,
      href: "/admin/delivery-companies?filter=pending",
    },
  ];
  return (
    <div className="space-y-6">
      <AdminDashboard
        {...data}
        adminId={profile.id}
        arabic={arabic}
        actions={actions}
      />
      <details className="card p-5">
        <summary className="cursor-pointer font-semibold">
          {arabic
            ? "إعدادات العرض وحالة السوق"
            : "Marketplace controls & health"}
        </summary>
        <div className="mt-5 space-y-5">
          <AdminDemoDataControl
            initialVisible={settings.data?.demo_data_visible !== false}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GoldPriceBadge />
            <Link href="/admin/gold-price" className="btn-ghost">
              {arabic ? "حالة سعر الذهب" : "Gold price health"}
            </Link>
            <Link href="/admin/audit" className="btn-ghost">
              {arabic ? "سجل التدقيق" : "Audit history"}
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}

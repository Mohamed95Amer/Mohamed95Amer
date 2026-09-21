import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductImage } from "@/components/ProductImage";
import { StoreBadges, StoreRating } from "@/components/StoreReputation";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";
import type { Metadata } from "next";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { dubaiTodayIso } from "@/lib/time";
import { getActiveSiteBanners, getActiveVendorPromotionMap } from "@/lib/marketing";
import { SiteBannerStack } from "@/components/SiteBanner";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Verified gold stores",
  description: "Browse verified UAE jewellery and bullion vendors with approved live inventory and verified-purchase ratings.",
  alternates: { canonical: "/vendors" },
};

type Listing = { id: string; category: string; karat: number; name: string; images: unknown };

export default async function VendorsListPage() {
  const supabase = getServiceSupabase();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const { data: settings } = await supabase.from("platform_settings").select("listing_fresh_days, demo_data_visible").eq("id", true).maybeSingle();
  const freshAfter = listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45));

  let vendorsQuery = supabase
      .from("vendors")
      .select("id, business_name, emirate, store_address")
      .eq("verification_status", "approved")
      .gte("license_expiry_date", dubaiTodayIso())
      .order("business_name");
    // One pass for every approved listing, grouped in memory. A per-vendor
    // query would mean N round trips to render a single page.
  let listingsQuery = supabase
      .from("products")
      .select("id, vendor_id, name, category, karat, images, vendors!inner(is_demo)")
      .eq("product_status", "approved")
      .eq("data_quality_status", "valid")
      .gt("quantity", 0)
      .gte("inventory_confirmed_at", freshAfter);
  if (settings?.demo_data_visible === false) {
    vendorsQuery = vendorsQuery.eq("is_demo", false);
    listingsQuery = listingsQuery.eq("is_demo", false).eq("vendors.is_demo", false);
  }
  const [{ data: vendors }, { data: listings }, { data: reputationRows }, banners] = await Promise.all([
    vendorsQuery,
    listingsQuery,
    supabase.from("vendor_reputation_summary").select("*"),
    getActiveSiteBanners(["vendors_top"]),
  ]);
  const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);

  const byVendor = new Map<string, Listing[]>();
  for (const p of listings ?? []) {
    const list = byVendor.get(p.vendor_id) ?? [];
    list.push({ id: p.id, category: p.category, karat: p.karat, name: p.name, images: p.images });
    byVendor.set(p.vendor_id, list);
  }
  const visibleVendors = (vendors ?? []).filter((vendor) => (byVendor.get(vendor.id)?.length ?? 0) > 0);
  const promoted = await getActiveVendorPromotionMap(visibleVendors.map((vendor) => vendor.id));
  const promotedVendors = visibleVendors.filter((vendor) => promoted.has(vendor.id));
  const organicVendors = visibleVendors.filter((vendor) => !promoted.has(vendor.id));

  return (
    <div className="container-pro py-10">
      <h1 className="font-serif text-3xl">{arabic ? "المتاجر الموثقة" : "Verified vendors"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        {arabic ? "اجتاز كل متجر أدناه التحقق من الرخصة والهوية وراجعه فريقنا يدوياً. يظل المتجر هو البائع المسؤول عن أي طلب." : "Every shop below has passed trade-license and identity verification, reviewed by hand. The vendor remains the seller of record on any order."}
      </p>

      <div className="mt-7"><SiteBannerStack banners={banners} /></div>

      {promotedVendors.length > 0 && <section className="mt-8">
        <p className="eyebrow text-jade-600">Promoted stores</p>
        <div className="mt-3 grid gap-4">
          {promotedVendors.map((vendor) => {
            const items = byVendor.get(vendor.id) ?? [];
            const placement = promoted.get(vendor.id)!;
            return <Link key={vendor.id} href={`/vendors/${vendor.id}`} className="group grid overflow-hidden rounded-3xl border border-gold-300/60 bg-gradient-to-r from-gold-50 via-white to-jade-50 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift md:grid-cols-[0.9fr_1.1fr]">
              <div className="grid min-h-48 grid-cols-3 gap-px bg-gold-200/40">{items.slice(0, 3).map((item) => <div key={item.id} className="relative min-h-44 overflow-hidden bg-bone-soft"><ProductImage category={item.category} karat={item.karat} name={item.name} images={item.images} sizes="(max-width: 768px) 33vw, 20vw" /></div>)}</div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <div className="flex items-center gap-2"><span className="rounded-full border border-jade-900/15 bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted">Ad</span><span className="text-xs font-bold uppercase tracking-[0.14em] text-gold-700">{placement.label}</span></div>
                <h2 className="mt-3 font-serif text-3xl font-semibold text-jade-950">{vendor.business_name}</h2>
                <p className="mt-1 text-sm text-ink-muted">{vendor.emirate} · {vendor.store_address}</p>
                <div className="mt-4"><StoreRating reputation={reputations.get(vendor.id)} /></div>
                <div className="mt-2"><StoreBadges reputation={reputations.get(vendor.id)} compact limit={2} /></div>
                <p className="mt-5 text-sm font-semibold text-jade-700">Explore {items.length} {items.length === 1 ? "listing" : "listings"} →</p>
              </div>
            </Link>;
          })}
        </div>
      </section>}

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {organicVendors.map((v) => {
          const items = byVendor.get(v.id) ?? [];
          return (
            <Link
              key={v.id}
              href={`/vendors/${v.id}`}
              className="card group flex flex-col overflow-hidden p-0 transition hover:border-gold-300 hover:shadow-card"
            >
              {items.length > 0 && (
                <div className="grid grid-cols-3 gap-px bg-bone-deep">
                  {items.slice(0, 3).map((p) => (
                    <div key={p.id} className="relative aspect-square overflow-hidden bg-bone-soft">
                      <ProductImage category={p.category} karat={p.karat} name={p.name} images={p.images} sizes="(max-width: 768px) 33vw, 11vw" />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{v.business_name}</div>
                  <span className="pill shrink-0 border-signal-ok/30 bg-signal-ok/10 text-[10px] text-signal-ok">
                    Verified
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink-muted">{v.emirate}</div>
                <div className="mt-2 line-clamp-2 text-xs text-ink-muted">{v.store_address}</div>
                <div className="mt-3"><StoreRating reputation={reputations.get(v.id)} compact /></div>
                <div className="mt-2"><StoreBadges reputation={reputations.get(v.id)} compact limit={2} /></div>
                <div className="mt-auto pt-3 text-xs font-medium text-ink">
                  {items.length} {items.length === 1 ? "listing" : "listings"}
                </div>
              </div>
            </Link>
          );
        })}

        {visibleVendors.length === 0 && (
          <p className="text-sm text-ink-muted">{arabic ? "لا توجد متاجر موثقة بعد." : "No verified vendors yet."}</p>
        )}
      </div>
    </div>
  );
}

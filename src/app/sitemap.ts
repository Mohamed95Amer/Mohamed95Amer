import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { dubaiTodayIso } from "@/lib/time";
import { RATE_KARATS, ratePath } from "@/lib/gold-rate/core";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl();
  const routes = ["", "/marketplace", "/vendors", "/requests/new", "/live-price", "/how-it-works", "/trust", "/contact", "/terms", "/privacy", "/delivery-and-collection", "/cancellations-and-refunds"];
  const rateSlugs = [undefined, ...RATE_KARATS.map((item) => item.slug)];
  const rateEntries: MetadataRoute.Sitemap = rateSlugs.flatMap((slug) => (["en", "ar"] as const).map((locale) => ({
    url: `${base}${ratePath(locale, slug)}`,
    lastModified: new Date(),
    changeFrequency: "hourly" as const,
    priority: slug ? 0.85 : 0.9,
    alternates: { languages: { en: `${base}${ratePath("en", slug)}`, ar: `${base}${ratePath("ar", slug)}` } },
  })));
  const staticEntries: MetadataRoute.Sitemap = [
    ...routes.map((route) => ({ url: `${base}${route}`, changeFrequency: route === "/marketplace" || route === "/live-price" ? "daily" as const : "monthly" as const, priority: route === "" ? 1 : route === "/marketplace" ? 0.9 : 0.65 })),
    ...rateEntries,
  ];

  try {
    const supabase = getServiceSupabase();
    const { data: settings } = await supabase.from("platform_settings").select("listing_fresh_days, demo_data_visible").eq("id", true).maybeSingle();
    const freshAfter = listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45));
    let productsQuery = supabase
      .from("products")
      .select("id, vendor_id, updated_at, vendors!inner(updated_at, verification_status, license_expiry_date, is_demo)")
      .eq("product_status", "approved")
      .eq("vendors.verification_status", "approved")
      .gte("vendors.license_expiry_date", dubaiTodayIso())
      .eq("data_quality_status", "valid")
      .gt("quantity", 0)
      .gte("inventory_confirmed_at", freshAfter);
    if (settings?.demo_data_visible !== true) {
      productsQuery = productsQuery.eq("is_demo", false).eq("vendors.is_demo", false);
    }
    const { data: products } = await productsQuery;
    const visibleVendors = new Map<string, string>();
    for (const product of products ?? []) {
      const vendor = product.vendors as unknown as { updated_at: string } | null;
      visibleVendors.set(product.vendor_id, vendor?.updated_at ?? product.updated_at);
    }
    return [
      ...staticEntries,
      ...(products ?? []).map((item) => ({ url: `${base}/products/${item.id}`, lastModified: item.updated_at, changeFrequency: "daily" as const, priority: 0.8 })),
      ...Array.from(visibleVendors, ([id, updatedAt]) => ({ url: `${base}/vendors/${id}`, lastModified: updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ];
  } catch {
    return staticEntries;
  }
}

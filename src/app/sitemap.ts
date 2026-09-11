import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl();
  const routes = ["", "/marketplace", "/vendors", "/live-price", "/how-it-works", "/trust", "/contact", "/terms", "/privacy", "/delivery-and-collection", "/cancellations-and-refunds"];
  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({ url: `${base}${route}`, changeFrequency: route === "/marketplace" || route === "/live-price" ? "daily" : "monthly", priority: route === "" ? 1 : route === "/marketplace" ? 0.9 : 0.65 }));

  try {
    const supabase = getServiceSupabase();
    const [{ data: products }, { data: vendors }] = await Promise.all([
      supabase.from("products").select("id, updated_at").eq("product_status", "approved"),
      supabase.from("vendors").select("id, updated_at").eq("verification_status", "approved"),
    ]);
    return [
      ...staticEntries,
      ...(products ?? []).map((item) => ({ url: `${base}/products/${item.id}`, lastModified: item.updated_at, changeFrequency: "daily" as const, priority: 0.8 })),
      ...(vendors ?? []).map((item) => ({ url: `${base}/vendors/${item.id}`, lastModified: item.updated_at, changeFrequency: "weekly" as const, priority: 0.7 })),
    ];
  } catch {
    return staticEntries;
  }
}

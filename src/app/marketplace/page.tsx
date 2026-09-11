import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductCard } from "@/components/ProductCard";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";
import type { Metadata } from "next";
import { getLatestTick } from "@/lib/gold-price/service";
import { computePrice } from "@/lib/pricing/calc";
import { computeGoldHubValueScore } from "@/lib/pricing/value-score";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gold marketplace",
  description: "Compare live-priced jewellery and bullion from verified UAE gold shops.",
  alternates: { canonical: "/marketplace" },
};

interface SP {
  searchParams: { category?: string; karat?: string; q?: string; sort?: string };
}

export default async function MarketplacePage({ searchParams }: SP) {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("products")
    .select(
      "id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, quantity, images, vendor_id, created_at, vendors(id, business_name, emirate, verification_status)",
    )
    .eq("product_status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);

  if (searchParams.category) query = query.eq("category", searchParams.category);
  if (searchParams.karat) query = query.eq("karat", Number(searchParams.karat));
  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);

  const [{ data }, { data: fees }, { data: reputationRows }, latestTick] = await Promise.all([
    query,
    supabase
      .from("platform_settings")
      .select("platform_fee_bps, delivery_fee_aed")
      .eq("id", true)
      .maybeSingle(),
    supabase.from("vendor_reputation_summary").select("*"),
    getLatestTick(),
  ]);
  const platformFeeBps = Number(fees?.platform_fee_bps ?? 50);
  const deliveryFee = Number(fees?.delivery_fee_aed ?? 0);
  const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);
  const liveRate = Number(latestTick?.price_per_gram_24k_aed ?? 0);
  const sorted = [...(data ?? [])].sort((a, b) => {
    if (searchParams.sort === "rating") return (reputations.get(b.vendor_id)?.adjustedRating ?? -1) - (reputations.get(a.vendor_id)?.adjustedRating ?? -1);
    if (searchParams.sort === "price_low" || searchParams.sort === "price_high" || searchParams.sort === "value") {
      const aPrice = listingPrice(a, liveRate, platformFeeBps, deliveryFee);
      const bPrice = listingPrice(b, liveRate, platformFeeBps, deliveryFee);
      if (searchParams.sort === "price_low") return aPrice.total - bPrice.total;
      if (searchParams.sort === "price_high") return bPrice.total - aPrice.total;
      return bPrice.score - aPrice.score;
    }
    return 0;
  });
  return (
    <div className="pb-16">
      <section className="relative overflow-hidden bg-jade-900 text-white">
        <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full border border-gold-200/15" />
        <div className="container-pro relative flex flex-col gap-6 py-12 sm:py-14 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow text-gold-200">Verified UAE inventory</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">The marketplace</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">
              Compare approved jewellery and bullion with totals that follow the live market.
            </p>
          </div>
          <div className="shrink-0">
            <GoldPriceBadge tone="dark" />
          </div>
        </div>
      </section>

      <div className="container-pro -mt-5 relative">
        <form className="card grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-[1.3fr_0.85fr_0.75fr_0.95fr_auto] lg:items-end">
          <div>
            <label className="label" htmlFor="marketplace-search">Search listings</label>
            <input id="marketplace-search" className="input" name="q" type="search" defaultValue={searchParams.q ?? ""} placeholder="Try ‘bangle’ or ‘gold bar’" />
          </div>
          <div>
            <label className="label" htmlFor="marketplace-category">Category</label>
            <select id="marketplace-category" className="input capitalize" name="category" defaultValue={searchParams.category ?? ""}>
              <option value="">All categories</option>
              {["ring","necklace","bracelet","earring","bangle","chain","pendant","bar","coin","other"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="marketplace-karat">Purity</label>
            <select id="marketplace-karat" className="input" name="karat" defaultValue={searchParams.karat ?? ""}>
              <option value="">All karats</option>
              {[18, 21, 22, 24].map((k) => <option key={k} value={k}>{k}K</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="marketplace-sort">Sort by</label>
            <select id="marketplace-sort" className="input" name="sort" defaultValue={searchParams.sort ?? "newest"}>
              <option value="newest">Newest</option>
              <option value="value">Best Value Score</option>
              <option value="price_low">Lowest total</option>
              <option value="price_high">Highest total</option>
              <option value="rating">Store rating</option>
            </select>
          </div>
          <button className="btn-primary min-w-28">Apply filters</button>
        </form>

        {(searchParams.category || searchParams.karat || searchParams.q || (searchParams.sort && searchParams.sort !== "newest")) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-ink-muted">Applied:</span>
            {searchParams.q && <span className="pill border-jade-900/10 bg-white">Search “{searchParams.q}”</span>}
            {searchParams.category && <span className="pill border-jade-900/10 bg-white capitalize">{searchParams.category}</span>}
            {searchParams.karat && <span className="pill border-jade-900/10 bg-white">{searchParams.karat}K</span>}
            {searchParams.sort && searchParams.sort !== "newest" && <span className="pill border-jade-900/10 bg-white">Sorted: {searchParams.sort.replaceAll("_", " ")}</span>}
            <Link href="/marketplace" className="ml-1 font-semibold text-jade-700 underline underline-offset-4">Clear all</Link>
          </div>
        )}

        <div className="mt-10 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-jade-600">Available now</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">
              {sorted.length} {sorted.length === 1 ? "listing" : "listings"}
            </h2>
          </div>
          {(searchParams.category || searchParams.karat || searchParams.q) && (
            <Link href="/marketplace" className="text-sm font-semibold text-jade-700 hover:text-jade-500">
              Clear filters
            </Link>
          )}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p, index) => {
            const v = p.vendors as unknown as
              { id: string; business_name: string; emirate: string; verification_status: string } | null;
            const vendor = v ? { ...v, reputation: reputations.get(v.id) ?? null } : null;
            return (
              <ProductCard
                key={p.id}
                p={{ ...p, available: p.quantity, vendor }}
                platformFeeBps={platformFeeBps}
                deliveryFee={deliveryFee}
                priority={index === 0}
              />
            );
          })}
          {sorted.length === 0 && (
            <div className="card col-span-full px-6 py-14 text-center">
              <p className="font-serif text-2xl text-jade-950">No matching gold yet.</p>
              <p className="mt-2 text-sm text-ink-muted">Try a broader category or clear your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function listingPrice(product: any, liveRate: number, platformFeeBps: number, deliveryFee: number) {
  if (!Number.isFinite(liveRate) || liveRate <= 0) return { total: Number.POSITIVE_INFINITY, score: -1 };
  const breakdown = computePrice({
    pricePerGram24kAed: liveRate,
    karat: Number(product.karat),
    weightGrams: Number(product.weight_grams),
    makingCharge: Number(product.making_charge),
    makingChargeDiscountPercent: Number(product.making_charge_discount_percent),
    makingChargeOfferEndsAt: product.making_charge_offer_ends_at,
    certificateFee: Number(product.certificate_fee),
    stoneValue: Number(product.stone_value),
    vendorPremium: Number(product.vendor_premium),
    platformFeeBps,
    deliveryFee,
  });
  return { total: breakdown.unitPriceAed, score: computeGoldHubValueScore(breakdown, Number(product.weight_grams))?.score ?? -1 };
}

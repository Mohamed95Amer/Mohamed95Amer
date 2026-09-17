import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductCard } from "@/components/ProductCard";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";
import type { Metadata } from "next";
import { getLatestTick } from "@/lib/gold-price/service";
import { computePrice } from "@/lib/pricing/calc";
import { computeGoldHubValueScore } from "@/lib/pricing/value-score";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { TrackPageView } from "@/components/TrackPageView";
import { dubaiTodayIso } from "@/lib/time";
import { getCurrentProfile } from "@/lib/auth/server";
import { getCustomerFeeOffer } from "@/lib/pricing/customer-fee";
import { applyEventDeliveryDiscount, getActiveSiteBanners } from "@/lib/marketing";
import { SiteBannerStack } from "@/components/SiteBanner";
import { ActiveOfferNotice } from "@/components/ActiveOfferNotice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gold marketplace",
  description: "Compare live-priced jewellery and bullion from verified UAE gold shops.",
  alternates: { canonical: "/marketplace" },
};

interface SP {
  searchParams: Promise<{ category?: string; karat?: string; q?: string; sort?: string; emirate?: string; minWeight?: string; maxWeight?: string; maxTotal?: string; certified?: string }>;
}

export default async function MarketplacePage({ searchParams }: SP) {
  const filters = await searchParams;
  const supabase = getServiceSupabase();
  const profile = await getCurrentProfile();
  const feeOffer = await getCustomerFeeOffer(profile?.role === "customer" ? profile.id : null);
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("platform_fee_bps, delivery_fee_aed, listing_fresh_days")
    .eq("id", true)
    .maybeSingle();
  const freshAfter = listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45));
  let query = supabase
    .from("products")
    .select(
      "id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, vendor_rate_adjustment_per_gram, vat_rate_bps, quantity, images, vendor_id, created_at, vendors!inner(id, business_name, emirate, verification_status, license_expiry_date)",
    )
    .eq("product_status", "approved")
    .eq("vendors.verification_status", "approved")
    .gte("vendors.license_expiry_date", dubaiTodayIso())
    .eq("data_quality_status", "valid")
    .gt("quantity", 0)
    .gte("inventory_confirmed_at", freshAfter)
    .order("created_at", { ascending: false })
    .limit(60);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.karat) query = query.eq("karat", Number(filters.karat));
  if (filters.q) query = query.textSearch("search_document", filters.q, { type: "websearch", config: "simple" });
  if (filters.emirate) query = query.eq("vendors.emirate", filters.emirate);
  if (Number(filters.minWeight) > 0) query = query.gte("weight_grams", Number(filters.minWeight));
  if (Number(filters.maxWeight) > 0) query = query.lte("weight_grams", Number(filters.maxWeight));
  if (filters.certified === "yes") query = query.not("certificate_number", "is", null);

  const [{ data }, { data: reputationRows }, latestTick, banners] = await Promise.all([
    query,
    supabase.from("vendor_reputation_summary").select("*"),
    getLatestTick(),
    getActiveSiteBanners(["marketplace_top"]),
  ]);
  const platformFeeBps = feeOffer.effectiveBps;
  const deliveryFee = applyEventDeliveryDiscount(Number(settings?.delivery_fee_aed ?? 0), feeOffer.eventDeliveryDiscountPercent);
  const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);
  const liveRate = Number(latestTick?.price_per_gram_24k_aed ?? 0);
  const pricedFiltered = [...(data ?? [])].filter((product) => !Number(filters.maxTotal) || listingPrice(product, liveRate, platformFeeBps, deliveryFee).total <= Number(filters.maxTotal));
  const sorted = pricedFiltered.sort((a, b) => {
    if (filters.sort === "rating") return (reputations.get(b.vendor_id)?.adjustedRating ?? -1) - (reputations.get(a.vendor_id)?.adjustedRating ?? -1);
    if (filters.sort === "price_low" || filters.sort === "price_high" || filters.sort === "value") {
      const aPrice = listingPrice(a, liveRate, platformFeeBps, deliveryFee);
      const bPrice = listingPrice(b, liveRate, platformFeeBps, deliveryFee);
      if (filters.sort === "price_low") return aPrice.total - bPrice.total;
      if (filters.sort === "price_high") return bPrice.total - aPrice.total;
      return bPrice.score - aPrice.score;
    }
    return 0;
  });
  return (
    <div className="pb-16">
      <TrackPageView eventName={filters.q ? "search" : "marketplace_view"} metadata={filters.q ? { queryLength: filters.q.length, hasCategory: Boolean(filters.category), hasKarat: Boolean(filters.karat) } : {}} />
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
        {(banners.length > 0 || feeOffer.eventPromotionTitle) && <div className="mb-5 grid gap-4 pt-10"><SiteBannerStack banners={banners} /><ActiveOfferNotice offer={feeOffer} /></div>}
        <form className="card grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div>
            <label className="label" htmlFor="marketplace-search">Search listings</label>
            <input id="marketplace-search" className="input" name="q" type="search" defaultValue={filters.q ?? ""} placeholder="Try ‘bangle’ or ‘gold bar’" />
          </div>
          <div>
            <label className="label" htmlFor="marketplace-category">Category</label>
            <select id="marketplace-category" className="input capitalize" name="category" defaultValue={filters.category ?? ""}>
              <option value="">All categories</option>
              {["ring","necklace","bracelet","earring","bangle","chain","pendant","bar","coin","other"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="marketplace-karat">Purity</label>
            <select id="marketplace-karat" className="input" name="karat" defaultValue={filters.karat ?? ""}>
              <option value="">All karats</option>
              {[24, 22, 21, 18, 16, 14, 12].map((k) => <option key={k} value={k}>{k}K</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="marketplace-sort">Sort by</label>
            <select id="marketplace-sort" className="input" name="sort" defaultValue={filters.sort ?? "newest"}>
              <option value="newest">Newest</option>
              <option value="value">Best Value Score</option>
              <option value="price_low">Lowest total</option>
              <option value="price_high">Highest total</option>
              <option value="rating">Store rating</option>
            </select>
          </div>
          <details className="rounded-lg border border-jade-900/10 bg-bone-soft p-3 md:col-span-2 lg:col-span-4" open={Boolean(filters.emirate || filters.minWeight || filters.maxWeight || filters.maxTotal || filters.certified)}>
            <summary className="cursor-pointer py-1.5 text-sm font-semibold text-jade-900">More filters <span className="ml-1 text-xs font-normal text-ink-muted">Emirate, weight, budget &amp; certificates</span></summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div><label className="label" htmlFor="marketplace-emirate">Store emirate</label><select id="marketplace-emirate" className="input" name="emirate" defaultValue={filters.emirate ?? ""}><option value="">All Emirates</option>{["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div><label className="label" htmlFor="marketplace-min-weight">Minimum weight (g)</label><input id="marketplace-min-weight" className="input" name="minWeight" type="number" min="0" step="0.1" defaultValue={filters.minWeight ?? ""} placeholder="Any" /></div>
          <div><label className="label" htmlFor="marketplace-max-weight">Maximum weight (g)</label><input id="marketplace-max-weight" className="input" name="maxWeight" type="number" min="0" step="0.1" defaultValue={filters.maxWeight ?? ""} placeholder="Any" /></div>
          <div><label className="label" htmlFor="marketplace-max-total">Maximum live total (AED)</label><input id="marketplace-max-total" className="input" name="maxTotal" type="number" min="1" step="1" defaultValue={filters.maxTotal ?? ""} placeholder="Any" /></div>
          <div><label className="label" htmlFor="marketplace-certified">Certificate / assay</label><select id="marketplace-certified" className="input" name="certified" defaultValue={filters.certified ?? ""}><option value="">Any</option><option value="yes">Certificate reference listed</option></select></div>
            </div>
          </details>
          <button className="btn-primary min-w-28 lg:col-span-4">Apply filters</button>
        </form>

        {(filters.category || filters.karat || filters.q || filters.emirate || filters.minWeight || filters.maxWeight || filters.maxTotal || filters.certified || (filters.sort && filters.sort !== "newest")) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-ink-muted">Applied:</span>
            {filters.q && <span className="pill border-jade-900/10 bg-white">Search “{filters.q}”</span>}
            {filters.category && <span className="pill border-jade-900/10 bg-white capitalize">{filters.category}</span>}
            {filters.karat && <span className="pill border-jade-900/10 bg-white">{filters.karat}K</span>}
            {filters.emirate && <span className="pill border-jade-900/10 bg-white">{filters.emirate}</span>}
            {filters.minWeight && <span className="pill border-jade-900/10 bg-white">From {filters.minWeight}g</span>}
            {filters.maxWeight && <span className="pill border-jade-900/10 bg-white">Up to {filters.maxWeight}g</span>}
            {filters.maxTotal && <span className="pill border-jade-900/10 bg-white">Up to AED {filters.maxTotal}</span>}
            {filters.certified && <span className="pill border-jade-900/10 bg-white">Certificate listed</span>}
            {filters.sort && filters.sort !== "newest" && <span className="pill border-jade-900/10 bg-white">Sorted: {filters.sort.replaceAll("_", " ")}</span>}
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
          {(filters.category || filters.karat || filters.q) && (
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
                customerFeeDiscountPercent={feeOffer.discountPercent}
                eventFeeDiscountPercent={feeOffer.eventDiscountPercent}
                eventPromotionTitle={feeOffer.eventPromotionTitle}
                deliveryFee={deliveryFee}
                priority={index === 0}
              />
            );
          })}
          {sorted.length === 0 && (
            <div className="card col-span-full px-6 py-14 text-center">
              <p className="font-serif text-2xl text-jade-950">No matching gold yet.</p>
              <p className="mt-2 text-sm text-ink-muted">Try a broader category or clear your search.</p>
              <Link href="/requests/new" className="btn-primary mt-5">Ask verified stores</Link>
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
    vendorRateAdjustmentPerGram: Number(product.vendor_rate_adjustment_per_gram ?? 0),
    platformFeeBps,
    deliveryFee,
    vatRateBps: Number(product.vat_rate_bps ?? 500),
  });
  return { total: breakdown.unitPriceAed, score: computeGoldHubValueScore(breakdown, Number(product.weight_grams))?.score ?? -1 };
}

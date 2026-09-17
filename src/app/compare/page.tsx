import Link from "next/link";
import type { Metadata } from "next";
import { ProductImage } from "@/components/ProductImage";
import { GoldHubValueScore } from "@/components/GoldHubValueScore";
import { getLatestTick } from "@/lib/gold-price/service";
import { computePrice, formatAed, goldRateForKarat } from "@/lib/pricing/calc";
import { computeGoldHubValueScore } from "@/lib/pricing/value-score";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { getServiceSupabase } from "@/lib/supabase/server";
import { dubaiTodayIso } from "@/lib/time";
import { getCurrentProfile } from "@/lib/auth/server";
import { getCustomerFeeOffer } from "@/lib/pricing/customer-fee";
import { applyEventDeliveryDiscount } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare gold", description: "Compare Get Gold listings on price, making, purity and value." };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: raw = "" } = await searchParams;
  const ids = raw.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 4);
  const admin = getServiceSupabase();
  const profile = await getCurrentProfile();
  const feeOffer = await getCustomerFeeOffer(profile?.role === "customer" ? profile.id : null);
  const [{ data: settings }, tick] = await Promise.all([
    admin.from("platform_settings").select("platform_fee_bps, delivery_fee_aed, listing_fresh_days").eq("id", true).maybeSingle(),
    getLatestTick(),
  ]);
  const { data: products } = ids.length ? await admin.from("products").select("id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, vendor_rate_adjustment_per_gram, assay_fineness, vat_rate_bps, images, inventory_confirmed_at, data_quality_status, quantity, product_status, vendor:vendors!inner(business_name, verification_status, license_expiry_date)").in("id", ids).eq("product_status", "approved").eq("data_quality_status", "valid").eq("vendors.verification_status", "approved").gte("vendors.license_expiry_date", dubaiTodayIso()).gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45))) : { data: [] };
  const ordered = ids.map((id) => products?.find((product) => product.id === id)).filter(Boolean) as any[];
  const rate = Number(tick?.price_per_gram_24k_aed ?? 0);
  const rows = ordered.map((product) => {
    const breakdown = computePrice({ pricePerGram24kAed: rate, karat: Number(product.karat), weightGrams: Number(product.weight_grams), makingCharge: Number(product.making_charge), makingChargeDiscountPercent: Number(product.making_charge_discount_percent), makingChargeOfferEndsAt: product.making_charge_offer_ends_at, certificateFee: Number(product.certificate_fee), stoneValue: Number(product.stone_value), vendorPremium: Number(product.vendor_premium), vendorRateAdjustmentPerGram: Number(product.vendor_rate_adjustment_per_gram ?? 0), assayFineness: product.assay_fineness == null ? null : Number(product.assay_fineness), platformFeeBps: feeOffer.effectiveBps, deliveryFee: applyEventDeliveryDiscount(Number(settings?.delivery_fee_aed ?? 0), feeOffer.eventDeliveryDiscountPercent), vatRateBps: Number(product.vat_rate_bps ?? 500) });
    return { product, breakdown, score: computeGoldHubValueScore(breakdown, Number(product.weight_grams)) };
  });
  return <main className="container-pro py-10 sm:py-14"><p className="eyebrow text-jade-600">Side-by-side transparency</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-4xl font-semibold text-jade-950">Compare gold clearly</h1><p className="mt-2 text-sm text-ink-muted">Live totals use the same current 24K reference. Delivery and VAT are included for consistency.</p></div><Link href="/marketplace" className="btn-ghost">Add more listings</Link></div>{rows.length < 2 ? <div className="card mt-8 p-8 text-center"><h2 className="font-serif text-2xl text-jade-950">Choose at least two listings</h2><p className="mt-2 text-sm text-ink-muted">Open a product, tap Compare, and repeat for up to four items.</p><Link href="/marketplace" className="btn-primary mt-5">Browse gold</Link></div> : <div className="mt-8 overflow-x-auto pb-3"><div className="grid min-w-[720px] gap-4" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(180px, 1fr))` }}>{rows.map(({ product, breakdown, score }) => { const vendor = Array.isArray(product.vendor) ? product.vendor[0] : product.vendor; return <article key={product.id} className="card overflow-hidden"><div className="relative aspect-square bg-jade-50"><ProductImage category={product.category} karat={product.karat} name={product.name} images={product.images} sizes="240px" /></div><div className="p-5"><p className="eyebrow text-jade-600">{product.karat}K · {product.weight_grams}g</p><h2 className="mt-1 min-h-14 font-serif text-xl font-semibold text-jade-950">{product.name}</h2><p className="text-xs text-ink-muted">{vendor?.business_name}</p><p className="mt-4 font-serif text-2xl font-semibold text-jade-950">{formatAed(breakdown.unitPriceAed)}</p>{score && <GoldHubValueScore value={score} compact />}<dl className="mt-4 space-y-2 border-t border-jade-900/10 pt-4 text-xs"><Metric label={`${product.karat}K metal / g`} value={formatAed(goldRateForKarat(rate, product.karat))} /><Metric label="Gold value" value={formatAed(breakdown.goldValueAed)} /><Metric label="Making" value={breakdown.makingCharge === 0 ? "No charge" : formatAed(breakdown.makingCharge)} /><Metric label="Certificate / assay" value={formatAed(breakdown.certificateFee)} /><Metric label="Stones" value={formatAed(breakdown.stoneValue)} /><Metric label="Get Gold fee" value={formatAed(breakdown.platformFee)} /><Metric label="Delivery" value={formatAed(breakdown.deliveryFee)} /><Metric label={`VAT (${breakdown.vatRateBps / 100}%)`} value={breakdown.vatRateBps === 0 ? "Not charged" : formatAed(breakdown.vatAed)} /></dl><Link href={`/products/${product.id}`} className="btn-primary mt-5 w-full">View & reserve</Link></div></article>; })}</div></div>}</main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-semibold text-jade-950">{value}</dd></div>; }

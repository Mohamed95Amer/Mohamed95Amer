import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getServiceSupabase } from "@/lib/supabase/server";
import { LiveProductPrice } from "@/components/LiveProductPrice";
import { ReserveButton } from "@/components/ReserveButton";
import { firstProductPhoto, ProductImage } from "@/components/ProductImage";
import { ReviewList } from "@/components/ReviewList";
import { StoreBadges, StoreRating } from "@/components/StoreReputation";
import { ProductActions } from "@/components/ProductActions";
import {
  normalizeReputation,
  PUBLIC_REVIEW_SELECT,
  type PublicReview,
  type VendorReputationRow,
} from "@/lib/reputation";

export const dynamic = "force-dynamic";

const SELECT =
  "id, name, description, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, quantity, images, certificate_number, hallmark_info, vendor_id, product_status, vendors(id, business_name, emirate, verification_status)";

type Vendor = {
  id: string;
  business_name: string;
  emirate: string;
  verification_status: string;
} | null;

async function loadProduct(id: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("products").select(SELECT).eq("id", id).single();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await loadProduct(params.id);
  if (!product || product.product_status !== "approved") return { title: "Not found — GoldHub" };
  const vendor = product.vendors as unknown as Vendor;
  return {
    title: `${product.name} — ${product.karat}K, ${product.weight_grams}g`,
    description:
      product.description ??
      `${product.karat}K ${product.category}, ${product.weight_grams}g${
        vendor ? `, from ${vendor.business_name}` : ""
      }. Priced live against the UAE gold market.`,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      type: "website",
      title: `${product.name} — ${product.karat}K, ${product.weight_grams}g`,
      description: product.description ?? `Live-priced ${product.karat}K ${product.category} from a verified UAE gold store.`,
      images: firstProductPhoto(product.images) ? [{ url: firstProductPhoto(product.images)! }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const supabase = getServiceSupabase();
  const product = await loadProduct(params.id);
  if (!product || product.product_status !== "approved") return notFound();

  const vendor = product.vendors as unknown as Vendor;

  const [{ data: settings }, { data: availability }, { data: reputationRow }, { data: reviews }] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("platform_fee_bps, delivery_fee_aed")
      .eq("id", true)
      .single(),
    // Stock net of unexpired holds. product.quantity alone would advertise
    // units that other customers are already holding.
    supabase.rpc("available_quantity", { p_product_id: product.id }),
    supabase
      .from("vendor_reputation_summary")
      .select("*")
      .eq("vendor_id", product.vendor_id)
      .maybeSingle(),
    supabase
      .from("reviews")
      .select(PUBLIC_REVIEW_SELECT)
      .eq("product_id", product.id)
      .eq("moderation_status", "published")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const reputation = reputationRow
    ? normalizeReputation(reputationRow as VendorReputationRow)
    : null;

  const available =
    typeof availability === "number" ? availability : Number(product.quantity ?? 0);
  const soldOut = available <= 0;

  const specs: Array<[string, string]> = [
    ["Category", String(product.category)],
    ["Purity", `${product.karat}K`],
    ["Weight", `${product.weight_grams} g`],
  ];
  if (product.hallmark_info) specs.push(["Hallmark", product.hallmark_info]);
  if (product.certificate_number) specs.push(["Certificate", product.certificate_number]);

  return (
    <div className="container-pro py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description ?? `${product.karat}K ${product.category}`,
        image: firstProductPhoto(product.images) ?? undefined,
        category: product.category,
        material: `${product.karat}K gold`,
        weight: { "@type": "QuantitativeValue", value: Number(product.weight_grams), unitCode: "GRM" },
        brand: vendor ? { "@type": "Brand", name: vendor.business_name } : undefined,
        ...(reputation?.averageRating && reputation.reviewCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reputation.averageRating, reviewCount: reputation.reviewCount, bestRating: 5 } } : {}),
      }) }} />
      <nav className="mb-7 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Link href="/" className="hover:text-jade-700">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/marketplace" className="hover:text-jade-700">Marketplace</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/marketplace?category=${product.category}`} className="capitalize hover:text-jade-700">
          {product.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-5 lg:gap-14">
        <div className="lg:col-span-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-jade-900/10 bg-jade-50 shadow-card">
            <ProductImage
              category={product.category}
              karat={product.karat}
              name={product.name}
              images={product.images}
              sizes="(max-width: 1024px) 100vw, 60vw"
              priority
            />
            <span className="absolute left-4 top-4 rounded-full border border-white/25 bg-white/90 px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-jade-950 shadow-sm backdrop-blur">
              {product.karat}K
            </span>
            {soldOut && (
              <span className="absolute right-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold text-bone backdrop-blur">
                Sold out
              </span>
            )}
          </div>

          <p className="eyebrow mt-8 text-jade-600">{product.category} · {product.weight_grams}g</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950">{product.name}</h1>
          {product.description && (
            <p className="mt-4 max-w-prose leading-relaxed text-ink-muted">{product.description}</p>
          )}
          <ProductActions name={product.name} />

          <h2 className="mt-10 font-serif text-2xl font-semibold text-jade-950">Specifications</h2>
          <dl className="mt-4 overflow-hidden rounded-2xl border border-jade-900/10 bg-white">
            {specs.map(([k, v], i) => (
              <div
                key={k}
                className={`flex justify-between gap-4 px-4 py-2.5 text-sm ${
                  i % 2 ? "bg-jade-50/70" : "bg-transparent"
                }`}
              >
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-right font-medium capitalize">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-40 lg:col-span-2 lg:self-start">
          <div className="card p-6 sm:p-7">
            {vendor && (
              <div className="mb-6 border-b border-jade-900/10 pb-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/vendors/${vendor.id}`} className="group text-sm">
                    <div className="font-semibold text-jade-950 group-hover:text-jade-600">{vendor.business_name}</div>
                    <div className="text-xs text-ink-muted">{vendor.emirate}</div>
                  </Link>
                  {vendor.verification_status === "approved" && (
                    <span className="pill shrink-0 border-signal-ok/30 bg-signal-ok/10 text-signal-ok">
                      ✓ Verified
                    </span>
                  )}
                </div>
                <div className="mt-3"><StoreRating reputation={reputation} compact /></div>
                <div className="mt-2"><StoreBadges reputation={reputation} compact /></div>
              </div>
            )}

            <LiveProductPrice
              karat={product.karat}
              weightGrams={Number(product.weight_grams)}
              makingCharge={Number(product.making_charge)}
              makingChargeDiscountPercent={Number(product.making_charge_discount_percent)}
              makingChargeOfferEndsAt={product.making_charge_offer_ends_at}
              certificateFee={Number(product.certificate_fee)}
              stoneValue={Number(product.stone_value)}
              vendorPremium={Number(product.vendor_premium)}
              platformFeeBps={Number(settings?.platform_fee_bps ?? 50)}
              deliveryFee={Number(settings?.delivery_fee_aed ?? 0)}
              showBreakdown
            />

            <p className="mt-4 text-xs text-ink-muted">
              {soldOut ? (
                <span className="font-medium text-signal-warn">
                  Every unit is currently reserved.
                </span>
              ) : (
                <>
                  <span className="font-medium text-signal-ok">{available}</span>{" "}
                  {available === 1 ? "unit" : "units"} available
                </>
              )}
            </p>

            <div className="mt-5">
              <ReserveButton
                productId={product.id}
                soldOut={soldOut}
                available={available}
                pricing={{
                  karat: product.karat,
                  weightGrams: Number(product.weight_grams),
                  makingCharge: Number(product.making_charge),
                  makingChargeDiscountPercent: Number(product.making_charge_discount_percent),
                  makingChargeOfferEndsAt: product.making_charge_offer_ends_at,
                  certificateFee: Number(product.certificate_fee),
                  stoneValue: Number(product.stone_value),
                  vendorPremium: Number(product.vendor_premium),
                  platformFeeBps: Number(settings?.platform_fee_bps ?? 50),
                  deliveryFee: Number(settings?.delivery_fee_aed ?? 0),
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-jade-950 p-5 text-sm leading-relaxed text-white/65 shadow-card">
            <p>
              <span className="font-semibold text-gold-200">The price is recomputed server-side</span> the
              moment you reserve, so what you pay matches the market at that instant — not what was
              on screen. GoldHub is a marketplace; the vendor remains the seller of record.
            </p>
          </div>
        </aside>
      </div>

      <section id="reviews" className="mt-14 border-t border-jade-900/10 pt-10 sm:mt-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-jade-600">Verified experiences</p>
            <h2 className="mt-1 font-serif text-3xl font-semibold text-jade-950">Reviews for this product</h2>
          </div>
          {vendor && (
            <Link href={`/vendors/${vendor.id}#reviews`} className="text-sm font-semibold text-jade-700 hover:text-jade-500">
              See all store reviews →
            </Link>
          )}
        </div>
        <div className="mt-6">
          <ReviewList
            reviews={(reviews ?? []) as PublicReview[]}
            emptyMessage="Only customers with a completed purchase can leave feedback."
          />
        </div>
      </section>
    </div>
  );
}

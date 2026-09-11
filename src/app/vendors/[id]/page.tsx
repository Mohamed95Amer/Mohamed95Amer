import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductImage } from "@/components/ProductImage";
import type { Metadata } from "next";
import { ReviewList } from "@/components/ReviewList";
import { ReputationOverview, StoreBadges, StoreRating } from "@/components/StoreReputation";
import {
  normalizeReputation,
  PUBLIC_REVIEW_SELECT,
  type PublicReview,
  type VendorReputationRow,
} from "@/lib/reputation";

export const dynamic = "force-dynamic";

async function loadVendor(id: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("vendors").select("id, business_name, emirate, store_address, google_maps_link, verification_status").eq("id", id).single();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const vendor = await loadVendor(params.id);
  if (!vendor || vendor.verification_status !== "approved") return { title: "Store not found" };
  return {
    title: vendor.business_name,
    description: `Browse approved gold and jewellery listings from ${vendor.business_name} in ${vendor.emirate}.`,
    alternates: { canonical: `/vendors/${vendor.id}` },
  };
}

export default async function VendorPage({ params }: { params: { id: string } }) {
  const supabase = getServiceSupabase();
  const vendor = await loadVendor(params.id);
  if (!vendor || vendor.verification_status !== "approved") return notFound();

  const [{ data: products }, { data: reputationRow }, { data: reviews }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, karat, weight_grams, images")
      .eq("vendor_id", params.id)
      .eq("product_status", "approved")
      .order("created_at", { ascending: false }),
    supabase.from("vendor_reputation_summary").select("*").eq("vendor_id", params.id).maybeSingle(),
    supabase
      .from("reviews")
      .select(PUBLIC_REVIEW_SELECT)
      .eq("vendor_id", params.id)
      .eq("moderation_status", "published")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const reputation = reputationRow ? normalizeReputation(reputationRow as VendorReputationRow) : null;

  return (
    <div className="container-pro py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JewelryStore",
        name: vendor.business_name,
        address: { "@type": "PostalAddress", addressLocality: vendor.emirate, streetAddress: vendor.store_address, addressCountry: "AE" },
        ...(reputation?.averageRating && reputation.reviewCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reputation.averageRating, reviewCount: reputation.reviewCount, bestRating: 5 } } : {}),
      }) }} />
      <div className="card p-6">
        <div className="flex flex-wrap gap-2">
          <span className="pill border-signal-ok/30 bg-signal-ok/10 text-signal-ok">✓ Verified UAE store</span>
          <StoreBadges reputation={reputation} />
        </div>
        <h1 className="mt-3 font-serif text-3xl">{vendor.business_name}</h1>
        <p className="text-sm text-ink-muted">{vendor.emirate} · {vendor.store_address}</p>
        <div className="mt-3"><StoreRating reputation={reputation} /></div>
        {vendor.google_maps_link && (
          <a className="text-sm underline" href={vendor.google_maps_link} target="_blank" rel="noreferrer">
            View on Google Maps
          </a>
        )}
      </div>

      {reputation && <div className="mt-8"><ReputationOverview reputation={reputation} /></div>}

      <h2 className="mt-10 font-serif text-2xl">Listings</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(products ?? []).map((p) => (
          <Link key={p.id} href={`/products/${p.id}`} className="card group overflow-hidden p-0 transition hover:border-gold-300">
            <div className="relative aspect-[4/3] overflow-hidden bg-jade-50">
              <ProductImage category={p.category} karat={p.karat} name={p.name} images={p.images} sizes="(max-width: 768px) 100vw, 33vw" className="transition duration-500 group-hover:scale-[1.03]" />
            </div>
            <div className="p-5">
              <div className="text-xs uppercase tracking-wide text-ink-muted">{p.category} · {p.karat}K</div>
              <h3 className="mt-1 font-serif text-xl">{p.name}</h3>
              <p className="text-sm text-ink-muted">{p.weight_grams}g</p>
            </div>
          </Link>
        ))}
        {(products ?? []).length === 0 && <p className="text-ink-muted">No active listings.</p>}
      </div>

      <section id="reviews" className="mt-12 border-t border-jade-900/10 pt-10">
        <p className="eyebrow text-jade-600">Verified purchases only</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold text-jade-950">Customer reviews</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Stores can respond publicly but cannot delete critical feedback.</p>
        <div className="mt-6">
          <ReviewList reviews={(reviews ?? []) as PublicReview[]} showProduct />
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import { HeritageIcon, UaeRibbon } from "@/components/HeritageArtwork";
import { ProductCard } from "@/components/ProductCard";
import { firstProductPhoto, ProductImage } from "@/components/ProductImage";
import { StoreBadges, StoreRating } from "@/components/StoreReputation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { dubaiTodayIso } from "@/lib/time";
import { getCurrentProfile } from "@/lib/auth/server";
import { getCustomerFeeOffer } from "@/lib/pricing/customer-fee";
import { applyEventDeliveryDiscount, getActiveSiteBanners, getActiveVendorPromotionMap } from "@/lib/marketing";
import { SiteBannerStack } from "@/components/SiteBanner";
import { ActiveOfferNotice } from "@/components/ActiveOfferNotice";
import { HomeMediaCarousel, type HomeShowcaseSlide } from "@/components/HomeMediaCarousel";

export const dynamic = "force-dynamic";

const categories = [
  { slug: "ring", label: "Rings", detail: "Bands & solitaires" },
  { slug: "necklace", label: "Necklaces", detail: "Statement & bridal" },
  { slug: "bracelet", label: "Bracelets", detail: "Classic & gemstone" },
  { slug: "bangle", label: "Bangles", detail: "Everyday & occasion" },
  { slug: "chain", label: "Chains", detail: "Essential gold chains" },
  { slug: "pendant", label: "Pendants", detail: "Detailed focal pieces" },
  { slug: "earring", label: "Earrings", detail: "Studs & drops" },
  { slug: "bar", label: "Gold bars", detail: "Certified bullion" },
  { slug: "coin", label: "Gold coins", detail: "Minted investment gold" },
];

export default async function HomePage() {
  const supabase = getServiceSupabase();
  const profile = await getCurrentProfile();
  const feeOffer = await getCustomerFeeOffer(profile?.role === "customer" ? profile.id : null);
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("platform_fee_bps, delivery_fee_aed, listing_fresh_days")
    .eq("id", true)
    .maybeSingle();
  const freshAfter = listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45));
  const [{ data: products }, { data: vendors }, { data: categoryProducts }, { data: reputationRows }, banners] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, vendor_rate_adjustment_per_gram, assay_fineness, vat_rate_bps, quantity, images, vendor_id, vendors!inner(id, business_name, emirate, verification_status, license_expiry_date)",
      )
      .eq("product_status", "approved")
      .eq("vendors.verification_status", "approved")
      .gte("vendors.license_expiry_date", dubaiTodayIso())
      .eq("data_quality_status", "valid")
      .gt("quantity", 0)
      .gte("inventory_confirmed_at", freshAfter)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("vendors")
      .select("id, business_name, emirate")
      .eq("verification_status", "approved")
      .gte("license_expiry_date", dubaiTodayIso())
      .limit(30),
    supabase
      .from("products")
      .select("id, name, category, karat, images, vendor_id, vendors!inner(verification_status, license_expiry_date)")
      .eq("product_status", "approved")
      .eq("vendors.verification_status", "approved")
      .gte("vendors.license_expiry_date", dubaiTodayIso())
      .eq("data_quality_status", "valid")
      .gt("quantity", 0)
      .gte("inventory_confirmed_at", freshAfter)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("vendor_reputation_summary").select("*"),
    getActiveSiteBanners(["home_top", "home_middle"]),
  ]);
  const platformFeeBps = feeOffer.effectiveBps;
  const deliveryFee = applyEventDeliveryDiscount(Number(settings?.delivery_fee_aed ?? 0), feeOffer.eventDeliveryDiscountPercent);
  const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);
  const activeVendorIds = new Set((categoryProducts ?? []).map((product) => product.vendor_id));
  const activeVendors = (vendors ?? []).filter((vendor) => activeVendorIds.has(vendor.id));
  const promotedVendors = await getActiveVendorPromotionMap(activeVendors.map((vendor) => vendor.id));
  activeVendors.sort((a, b) => Number(promotedVendors.has(b.id)) - Number(promotedVendors.has(a.id)) || a.business_name.localeCompare(b.business_name));
  const topBanners = banners.filter((banner) => banner.placement === "home_top");
  const middleBanners = banners.filter((banner) => banner.placement === "home_middle");
  const showcaseSlides = (categoryProducts ?? []).reduce<HomeShowcaseSlide[]>((slides, product) => {
    if (slides.length >= 4 || slides.some((slide) => slide.id === product.id)) return slides;
    const photo = firstProductPhoto(product.images);
    if (!photo) return slides;
    slides.push({
      id: product.id,
      title: product.name,
      body: `${product.karat}K gold from a verified UAE jeweller, priced against the live market.`,
      mediaPath: photo,
      mediaAlt: product.name,
      mediaType: "image",
      ctaLabel: "View this piece",
      ctaHref: `/products/${product.id}`,
    });
    return slides;
  }, []);

  const categoryTiles = categories.flatMap((category) => {
    const matches = (categoryProducts ?? []).filter((item) => item.category === category.slug);
    const photo = matches.find((item) => firstProductPhoto(item.images));
    return photo ? [{ ...category, photo }] : [];
  });
  const categoryOrder = ["bangle", "necklace", "ring", "earring", "bracelet", "bar", "coin", "chain", "pendant"];
  categoryTiles.sort((a, b) => categoryOrder.indexOf(a.slug) - categoryOrder.indexOf(b.slug));

  return (
    <div className="heritage-home">
      <section className="heritage-hero">
        <div className="heritage-hero-art"><Image src="/images/uae-heritage-hero.webp" alt="" fill priority sizes="(max-width: 767px) 100vw, 75vw" className="object-cover" /></div>
        <div className="heritage-hero-wash" />
        <UaeRibbon />
        <div className="container-pro relative z-10">
          <div className="heritage-hero-copy">
            <p className="heritage-kicker">More than jewellery<br />A market brought together</p>
            <span className="mt-5 block h-px w-10 bg-gold-500" aria-hidden="true" />
            <h1>Bringing the UAE<br className="hidden sm:block" /> gold market online.</h1>
            <p className="heritage-hero-description">Trusted jewellers. Live gold prices. A more transparent, beautiful way to buy gold in the UAE.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/marketplace" className="btn-primary">Shop now <span className="ml-5" aria-hidden="true">→</span></Link>
              <Link href="/vendors" className="btn-ghost">Meet the jewellers</Link>
            </div>
            <div className="heritage-hero-promises">
              <div><HeritageIcon kind="shield" /><span>Verified in the UAE<small>Trade licences checked</small></span></div>
              <div><HeritageIcon kind="truck" /><span>Delivery or collection<small>Arranged with your store</small></span></div>
              <div><HeritageIcon kind="gem" /><span>Transparent pricing<small>Every charge explained</small></span></div>
            </div>
          </div>
        </div>
      </section>
      <section className="heritage-trust-strip" aria-label="The Get Gold experience">
        <div className="container-pro grid grid-cols-2 gap-y-6 md:grid-cols-4">
          {([
            ["store", "Verified jewellers", "UAE businesses, reviewed"],
            ["gem", "Live gold prices", "One shared market reference"],
            ["receipt", "Clear breakdowns", "Gold, making, fees & VAT"],
            ["truck", "Your choice", "Delivery or store collection"],
          ] as const).map(([icon, title, detail]) => (
            <div key={title} className="heritage-trust-item"><HeritageIcon kind={icon} /><div><p>{title}</p><span>{detail}</span></div></div>
          ))}
        </div>
      </section>

      {/* Keep the rotating photo/video placement immediately before category discovery. */}
      <HomeMediaCarousel banners={topBanners} fallbackSlides={showcaseSlides} />
      <div className="container-pro"><ActiveOfferNotice offer={feeOffer} /></div>

      <section className="container-pro heritage-section">
        <div className="heritage-section-heading"><h2>Find your piece</h2><Link href="/marketplace">Shop all categories <span aria-hidden="true">→</span></Link></div>
        <div className="heritage-categories">
          {categoryTiles.slice(0, 6).map((category) => (
            <Link key={category.slug} href={`/marketplace?category=${category.slug}`} className="heritage-category group">
              <div className="relative aspect-[1.12] overflow-hidden bg-bone"><ProductImage category={category.slug} karat={category.photo.karat} name={category.label} images={category.photo.images} sizes="(max-width: 639px) 45vw, (max-width: 1023px) 30vw, 16vw" className="transition duration-500 group-hover:scale-105" /></div>
              <div className="flex items-center justify-between gap-2 px-3 py-3.5"><span>{category.label}</span><span aria-hidden="true">→</span></div>
            </Link>
          ))}
        </div>
        {categoryTiles.length === 0 && <p className="py-6 text-sm text-ink-muted">New collections are on their way. <Link href="/requests/new" className="underline">Request your piece</Link>.</p>}
      </section>

      <section className="container-pro heritage-section">
        <div className="heritage-section-heading"><h2>Featured jewellers</h2><Link href="/vendors">View all stores <span aria-hidden="true">→</span></Link></div>
        <div className="grid gap-4 md:grid-cols-3">
          {activeVendors.slice(0, 3).map((vendor) => {
            const collection = (categoryProducts ?? []).filter((item) => item.vendor_id === vendor.id && firstProductPhoto(item.images)).slice(0, 2);
            return <Link key={vendor.id} href={`/vendors/${vendor.id}`} className="heritage-store group">
              <div className="relative grid h-44 grid-flow-col auto-cols-fr overflow-hidden bg-bone">
                {collection.map((item) => <div key={item.id} className="relative h-full overflow-hidden"><ProductImage category={item.category} karat={item.karat} name={item.name} images={item.images} sizes="(max-width: 767px) 45vw, 20vw" className="transition duration-500 group-hover:scale-105" /></div>)}
                <span className="absolute bottom-2 left-3 rounded bg-white/90 px-2 py-1 text-[10px] text-ink">From the store&apos;s collection</span>
                {promotedVendors.has(vendor.id) && <span className="absolute right-2 top-2 rounded bg-white px-2 py-1 text-[10px] text-ink">Ad · Premium</span>}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3"><h3 className="font-medium">{vendor.business_name}</h3><span aria-hidden="true">→</span></div>
                <p className="mt-1.5 text-xs text-jade-700">✓ Verified in the UAE <span className="text-ink-muted">· {vendor.emirate}</span></p>
                <div className="mt-2"><StoreRating reputation={reputations.get(vendor.id)} compact /></div>
                <div className="mt-2"><StoreBadges reputation={reputations.get(vendor.id)} compact limit={2} /></div>
              </div>
            </Link>;
          })}
        </div>
        {activeVendors.length === 0 && <p className="py-6 text-sm text-ink-muted">Our next jewellers are preparing their collections.</p>}
      </section>

      {middleBanners.length > 0 && <section className="container-pro py-6"><SiteBannerStack banners={middleBanners} /></section>}

      <section className="container-pro heritage-section pb-12 sm:pb-16">
        <div className="heritage-section-heading"><h2>Our top picks</h2><Link href="/marketplace">Shop all products <span aria-hidden="true">→</span></Link></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(products ?? []).map((product) => {
            const vendor = product.vendors as unknown as { id: string; business_name: string; emirate: string; verification_status: string } | null;
            return <ProductCard key={product.id} variant="heritage" p={{ ...product, vendor: vendor ? { ...vendor, reputation: reputations.get(vendor.id) ?? null } : null }}
              platformFeeBps={platformFeeBps} customerFeeDiscountPercent={feeOffer.discountPercent}
              eventFeeDiscountPercent={feeOffer.eventDiscountPercent} eventPromotionTitle={feeOffer.eventPromotionTitle} deliveryFee={deliveryFee} />;
          })}
        </div>
        {(products ?? []).length === 0 && <p className="py-6 text-sm text-ink-muted">No available listings just yet. <Link href="/requests/new" className="underline">Request a piece</Link>.</p>}
      </section>

      <section className="heritage-story">
        <div className="container-pro flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
          <div><p className="heritage-kicker">A richer tomorrow</p><h2 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Gold for a brighter UAE.</h2></div>
          <p className="max-w-xs text-sm leading-relaxed text-ink-soft">People, culture and opportunity — connected through gold.</p>
          <Link href="/how-it-works" className="btn-primary w-fit">Explore our story <span className="ml-5" aria-hidden="true">→</span></Link>
        </div>
      </section>
      <section className="container-pro flex flex-col gap-4 py-7 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Link href="/requests/new" className="font-medium text-jade-700 hover:underline">Looking for something special? Request a piece →</Link>
        <Link href="/vendor/register" className="text-ink-muted hover:text-jade-700">For UAE jewellers · Bring your store online →</Link>
      </section>
    </div>
  );
}

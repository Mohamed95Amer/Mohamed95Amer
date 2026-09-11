import Link from "next/link";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const categories = [
  "ring",
  "necklace",
  "bracelet",
  "bangle",
  "chain",
  "pendant",
  "earring",
  "bar",
  "coin",
  "other",
];

export default async function HomePage() {
  const supabase = getServiceSupabase();
  const [{ data: products }, { data: vendors }, { data: fees }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, category, karat, weight_grams, making_charge, stone_value, vendor_premium, quantity, images, vendor_id, vendors(business_name, emirate, verification_status)",
      )
      .eq("product_status", "approved")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vendors")
      .select("id, business_name, emirate")
      .eq("verification_status", "approved")
      .limit(6),
    supabase
      .from("platform_settings")
      .select("platform_fee_bps, delivery_fee_aed")
      .eq("id", true)
      .maybeSingle(),
  ]);
  const platformFeeBps = Number(fees?.platform_fee_bps ?? 50);
  const deliveryFee = Number(fees?.delivery_fee_aed ?? 0);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-jade-950 text-white">
        <div className="absolute inset-0 -z-10 opacity-70">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border border-gold-300/20" />
          <div className="absolute -right-8 top-12 h-72 w-72 rounded-full border border-gold-300/15" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-jade-500/15 blur-3xl" />
        </div>

        <div className="container-pro grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-24">
          <div>
            <p className="eyebrow text-gold-200">Gold, clearly priced</p>
            <h1 className="mt-5 max-w-3xl font-serif text-4xl font-semibold leading-[1.03] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              Buy gold with the
              <span className="block text-gold-200">market in plain sight.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/68 sm:text-lg">
              Discover jewellery and bullion from verified UAE gold shops. Every listing moves
              with the live 24K rate, and every reservation locks the price you see.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center rounded-full bg-gold-300 px-6 py-3 text-sm font-bold text-jade-950 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-gold-200"
              >
                Explore gold
                <span className="ml-2" aria-hidden="true">→</span>
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/10"
              >
                See how pricing works
              </Link>
            </div>

            <div className="mt-10 grid max-w-2xl gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
              {[
                ["Licensed", "UAE gold shops"],
                ["Live", "market-linked prices"],
                ["Locked", "for 10 minutes"],
              ].map(([value, label]) => (
                <div key={value}>
                  <div className="font-serif text-xl text-gold-200">{value}</div>
                  <div className="mt-0.5 text-xs text-white/50">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
            <div className="absolute -inset-4 rounded-[2.25rem] bg-gradient-to-br from-gold-300/20 via-transparent to-jade-300/15 blur-xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-bone-soft p-5 text-ink shadow-glow sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-jade-600">Live 24K reference</p>
                  <p className="mt-1 text-xs text-ink-muted">AED per gram</p>
                </div>
                <span className="rounded-full bg-jade-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-200">
                  Live market
                </span>
              </div>

              <div className="mt-6 rounded-2xl border border-jade-900/10 bg-white p-4 shadow-sm sm:p-5">
                <GoldPriceBadge />
                <div className="mt-5 h-px bg-jade-900/10" />
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                  The official total is recalculated on our server at the instant you reserve.
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["✓", "Trade licence checked"],
                  ["✓", "Hallmark details shown"],
                  ["✓", "No stale-rate checkout"],
                  ["✓", "Vendor remains seller"],
                ].map(([icon, label]) => (
                  <div key={label} className="flex items-center gap-2 text-xs font-medium text-jade-900">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-jade-100 text-[10px] text-jade-700">
                      {icon}
                    </span>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-pro py-16 sm:py-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-jade-600">Find your piece</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Shop by category
            </h2>
          </div>
          <Link href="/marketplace" className="text-sm font-semibold text-jade-700 hover:text-jade-500">
            View the full marketplace →
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {categories.map((category) => (
            <Link
              key={category}
              href={`/marketplace?category=${category}`}
              className="group overflow-hidden rounded-2xl border border-jade-900/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-jade-300 hover:shadow-card"
            >
              <div className="aspect-[4/3] overflow-hidden bg-jade-50">
                <ProductImage
                  category={category}
                  karat={22}
                  name={category}
                  className="transition duration-500 group-hover:scale-[1.05]"
                />
              </div>
              <div className="flex items-center justify-between px-3.5 py-3 text-sm font-semibold capitalize text-jade-950">
                {category}
                <span className="text-jade-400 transition group-hover:translate-x-0.5" aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-jade-900/5 bg-jade-50/70">
        <div className="container-pro py-16 sm:py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-jade-600">Market favourites</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                Featured listings
              </h2>
            </div>
            <Link href="/marketplace" className="hidden text-sm font-semibold text-jade-700 hover:text-jade-500 sm:block">
              Browse all →
            </Link>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {(products ?? []).map((product) => {
              const vendor = product.vendors as unknown as
                { business_name: string; emirate: string; verification_status: string } | null;
              return (
                <ProductCard
                  key={product.id}
                  p={{ ...product, available: product.quantity, vendor }}
                  platformFeeBps={platformFeeBps}
                  deliveryFee={deliveryFee}
                />
              );
            })}
            {(products ?? []).length === 0 && (
              <p className="text-ink-muted">No approved listings yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="container-pro grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="eyebrow text-jade-600">Shop with confidence</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            People behind every listing.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
            GoldHub is not the seller. We verify UAE businesses and make pricing transparent;
            the jeweller keeps the relationship, inventory, and fulfilment.
          </p>
          <Link href="/vendors" className="btn-ghost mt-6">
            Meet verified vendors
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(vendors ?? []).map((vendor) => (
            <Link
              key={vendor.id}
              href={`/vendors/${vendor.id}`}
              className="group rounded-2xl border border-jade-900/10 bg-white p-5 shadow-sm transition hover:border-jade-300 hover:shadow-card"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-serif text-lg font-semibold text-jade-950">{vendor.business_name}</div>
                  <div className="mt-1 text-xs text-ink-muted">{vendor.emirate}</div>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-jade-100 text-sm text-jade-700 transition group-hover:bg-jade-700 group-hover:text-white">
                  ✓
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-bone">
        <div className="container-pro py-16 sm:py-20">
          <div className="text-center">
            <p className="eyebrow text-jade-600">Simple by design</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              From live price to confirmed order
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Browse", "Compare verified listings while every product follows the same live 24K reference."],
              ["02", "Reserve", "We recompute the total server-side and hold that exact price for 10 minutes."],
              ["03", "Confirm", "The vendor confirms stock, then arranges collection or delivery directly with you."],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-2xl border border-jade-900/10 bg-white p-6">
                <span className="font-serif text-3xl text-gold-500">{number}</span>
                <h3 className="mt-6 font-serif text-2xl font-semibold text-jade-950">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-pro py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-jade-900 to-jade-700 px-6 py-12 text-center text-white shadow-lift sm:px-12">
          <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full border border-gold-200/20" />
          <p className="eyebrow relative text-gold-200">For UAE gold businesses</p>
          <h2 className="relative mt-3 font-serif text-3xl font-semibold sm:text-4xl">
            Bring your shop into the live market.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/65">
            Keep control of your stock and customer relationship while GoldHub makes discovery,
            verification, and transparent pricing easier.
          </p>
          <Link
            href="/vendor/register"
            className="relative mt-7 inline-flex rounded-full bg-gold-300 px-6 py-3 text-sm font-bold text-jade-950 transition hover:bg-gold-200"
          >
            List your gold shop
          </Link>
        </div>
      </section>
    </>
  );
}

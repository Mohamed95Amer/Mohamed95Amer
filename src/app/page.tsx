import Link from "next/link";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductCard } from "@/components/ProductCard";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = getServiceSupabase();
  const [{ data: products }, { data: vendors }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, karat, weight_grams, making_charge, stone_value, vendor_premium, quantity, images, vendor_id, vendors(business_name, emirate, verification_status)")
      .eq("product_status", "approved")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vendors")
      .select("id, business_name, emirate")
      .eq("verification_status", "approved")
      .limit(6),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="bg-bone">
        <div className="container-pro grid gap-10 py-20 md:grid-cols-2 md:items-center">
          <div>
            <div className="mb-4"><GoldPriceBadge /></div>
            <h1 className="font-serif text-4xl leading-tight text-ink md:text-6xl">
              Buy gold from verified UAE gold shops —{" "}
              <span className="text-gold-500">with live transparent pricing.</span>
            </h1>
            <p className="mt-5 max-w-xl text-ink-muted">
              GoldHub is a marketplace. Every shop is verified. Every price updates with the live market.
              No fine print, no stale rates.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/marketplace" className="btn-primary">Browse the marketplace</Link>
              <Link href="/vendor/register" className="btn-ghost">List your gold shop</Link>
            </div>
          </div>
          <div className="card p-6 md:p-8">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Live 24K price</p>
            <div className="mt-4"><GoldPriceBadge /></div>
            <ul className="mt-6 space-y-3 text-sm text-ink-muted">
              <li>✓ Trade-licensed jewellers only</li>
              <li>✓ Hallmarked & certified products</li>
              <li>✓ Price recomputed server-side at reservation</li>
              <li>✓ 10-minute price-lock window</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container-pro py-16">
        <h2 className="font-serif text-3xl">Browse categories</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          {["ring", "necklace", "bracelet", "bangle", "chain", "pendant", "earring", "bar", "coin", "other"].map(
            (c) => (
              <Link
                key={c}
                href={`/marketplace?category=${c}`}
                className="card p-5 text-center capitalize hover:border-gold-300 transition"
              >
                {c}
              </Link>
            ),
          )}
        </div>
      </section>

      {/* Featured products */}
      <section className="bg-bone-soft border-y border-bone-deep">
        <div className="container-pro py-16">
          <div className="flex items-end justify-between">
            <h2 className="font-serif text-3xl">Featured listings</h2>
            <Link href="/marketplace" className="text-sm text-ink-muted hover:text-ink">View all →</Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(products ?? []).map((p) => {
              const v = p.vendors as unknown as
                { business_name: string; emirate: string; verification_status: string } | null;
              return <ProductCard key={p.id} p={{ ...p, available: p.quantity, vendor: v }} />;
            })}
            {(products ?? []).length === 0 && (
              <p className="text-ink-muted">No approved listings yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Verified vendors */}
      <section className="container-pro py-16">
        <h2 className="font-serif text-3xl">Verified vendors</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {(vendors ?? []).map((v) => (
            <Link key={v.id} href={`/vendors/${v.id}`} className="card p-5 hover:border-gold-300 transition">
              <div className="font-medium">{v.business_name}</div>
              <div className="text-xs text-ink-muted mt-1">{v.emirate}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-ink text-bone-soft">
        <div className="container-pro py-16 grid gap-10 md:grid-cols-3">
          {[
            ["1. Browse", "Explore listings from verified UAE jewellers, with prices that update with the live market."],
            ["2. Reserve", "Lock the current price for 10 minutes while the vendor confirms availability."],
            ["3. Collect", "Pick up at the shop or arrange delivery once the vendor confirms."],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="font-serif text-2xl text-gold-200">{t}</h3>
              <p className="mt-2 text-sm text-bone/80">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA for vendors */}
      <section className="container-pro py-16 text-center">
        <h2 className="font-serif text-3xl">Run a gold shop in the UAE?</h2>
        <p className="mt-3 text-ink-muted">
          Reach customers across the Emirates. Keep your inventory. Pay only when you sell.
        </p>
        <Link href="/vendor/register" className="btn-primary mt-6 inline-flex">List your gold shop on GoldHub</Link>
      </section>
    </>
  );
}

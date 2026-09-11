import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductCard } from "@/components/ProductCard";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";

export const dynamic = "force-dynamic";

interface SP {
  searchParams: { category?: string; karat?: string; q?: string };
}

export default async function MarketplacePage({ searchParams }: SP) {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("products")
    .select(
      "id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, quantity, images, vendor_id, vendors(id, business_name, emirate, verification_status)",
    )
    .eq("product_status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);

  if (searchParams.category) query = query.eq("category", searchParams.category);
  if (searchParams.karat) query = query.eq("karat", Number(searchParams.karat));
  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);

  const [{ data }, { data: fees }, { data: reputationRows }] = await Promise.all([
    query,
    supabase
      .from("platform_settings")
      .select("platform_fee_bps, delivery_fee_aed")
      .eq("id", true)
      .maybeSingle(),
    supabase.from("vendor_reputation_summary").select("*"),
  ]);
  const platformFeeBps = Number(fees?.platform_fee_bps ?? 50);
  const deliveryFee = Number(fees?.delivery_fee_aed ?? 0);
  const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);
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
        <form className="card grid gap-4 p-5 md:grid-cols-[1.4fr_1fr_0.8fr_auto] md:items-end">
          <div>
            <label className="label">Search listings</label>
            <input className="input" name="q" defaultValue={searchParams.q ?? ""} placeholder="Try ‘bangle’ or ‘gold bar’" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input capitalize" name="category" defaultValue={searchParams.category ?? ""}>
              <option value="">All categories</option>
              {["ring","necklace","bracelet","earring","bangle","chain","pendant","bar","coin","other"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Purity</label>
            <select className="input" name="karat" defaultValue={searchParams.karat ?? ""}>
              <option value="">All karats</option>
              {[18, 21, 22, 24].map((k) => <option key={k} value={k}>{k}K</option>)}
            </select>
          </div>
          <button className="btn-primary min-w-28">Apply filters</button>
        </form>

        <div className="mt-10 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-jade-600">Available now</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">
              {(data ?? []).length} {(data ?? []).length === 1 ? "listing" : "listings"}
            </h2>
          </div>
          {(searchParams.category || searchParams.karat || searchParams.q) && (
            <Link href="/marketplace" className="text-sm font-semibold text-jade-700 hover:text-jade-500">
              Clear filters
            </Link>
          )}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((p) => {
            const v = p.vendors as unknown as
              { id: string; business_name: string; emirate: string; verification_status: string } | null;
            const vendor = v ? { ...v, reputation: reputations.get(v.id) ?? null } : null;
            return (
              <ProductCard
                key={p.id}
                p={{ ...p, available: p.quantity, vendor }}
                platformFeeBps={platformFeeBps}
                deliveryFee={deliveryFee}
              />
            );
          })}
          {(data ?? []).length === 0 && (
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

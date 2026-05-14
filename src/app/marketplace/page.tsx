import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";

export const dynamic = "force-dynamic";

interface SP {
  searchParams: { category?: string; karat?: string; q?: string };
}

export default async function MarketplacePage({ searchParams }: SP) {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("products")
    .select(
      "id, name, category, karat, weight_grams, vendor_id, vendors(business_name, emirate)",
    )
    .eq("product_status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);

  if (searchParams.category) query = query.eq("category", searchParams.category);
  if (searchParams.karat) query = query.eq("karat", Number(searchParams.karat));
  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);

  const { data } = await query;
  return (
    <div className="container-pro py-10">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl">Marketplace</h1>
          <p className="text-sm text-ink-muted">Approved listings from verified UAE jewellers.</p>
        </div>
        <GoldPriceBadge />
      </div>

      <form className="card mt-6 grid gap-3 p-4 md:grid-cols-4">
        <div>
          <label className="label">Search</label>
          <input className="input" name="q" defaultValue={searchParams.q ?? ""} placeholder="e.g. bangle" />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" name="category" defaultValue={searchParams.category ?? ""}>
            <option value="">All</option>
            {["ring","necklace","bracelet","earring","bangle","chain","pendant","bar","coin","other"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Karat</label>
          <select className="input" name="karat" defaultValue={searchParams.karat ?? ""}>
            <option value="">All</option>
            {[18, 21, 22, 24].map((k) => <option key={k} value={k}>{k}K</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full">Apply</button>
        </div>
      </form>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((p) => {
          const v = (p.vendors as unknown as { business_name: string; emirate: string } | null);
          return (
            <Link key={p.id} href={`/products/${p.id}`} className="card p-5 hover:border-gold-300 transition">
              <div className="text-xs uppercase tracking-wide text-ink-muted">{p.category} · {p.karat}K</div>
              <h2 className="mt-1 font-serif text-xl">{p.name}</h2>
              <p className="text-sm text-ink-muted">{p.weight_grams}g</p>
              {v && (
                <p className="mt-3 text-xs text-ink-muted">
                  Sold by <span className="text-ink font-medium">{v.business_name}</span> · {v.emirate}
                </p>
              )}
            </Link>
          );
        })}
        {(data ?? []).length === 0 && (
          <p className="text-ink-muted">No products match your filters.</p>
        )}
      </div>
    </div>
  );
}

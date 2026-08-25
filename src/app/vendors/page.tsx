import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductImage } from "@/components/ProductImage";

export const dynamic = "force-dynamic";

type Listing = { id: string; category: string; karat: number; name: string };

export default async function VendorsListPage() {
  const supabase = getServiceSupabase();

  const [{ data: vendors }, { data: listings }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, business_name, emirate, store_address")
      .eq("verification_status", "approved")
      .order("business_name"),
    // One pass for every approved listing, grouped in memory. A per-vendor
    // query would mean N round trips to render a single page.
    supabase
      .from("products")
      .select("id, vendor_id, name, category, karat")
      .eq("product_status", "approved"),
  ]);

  const byVendor = new Map<string, Listing[]>();
  for (const p of listings ?? []) {
    const list = byVendor.get(p.vendor_id) ?? [];
    list.push({ id: p.id, category: p.category, karat: p.karat, name: p.name });
    byVendor.set(p.vendor_id, list);
  }

  return (
    <div className="container-pro py-10">
      <h1 className="font-serif text-3xl">Verified vendors</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Every shop below has passed trade-license and identity verification, reviewed by hand. The
        vendor remains the seller of record on any order.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {(vendors ?? []).map((v) => {
          const items = byVendor.get(v.id) ?? [];
          return (
            <Link
              key={v.id}
              href={`/vendors/${v.id}`}
              className="card group flex flex-col overflow-hidden p-0 transition hover:border-gold-300 hover:shadow-card"
            >
              {items.length > 0 && (
                <div className="grid grid-cols-3 gap-px bg-bone-deep">
                  {items.slice(0, 3).map((p) => (
                    <div key={p.id} className="aspect-square overflow-hidden bg-bone-soft">
                      <ProductImage category={p.category} karat={p.karat} name={p.name} />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{v.business_name}</div>
                  <span className="pill shrink-0 border-signal-ok/30 bg-signal-ok/10 text-[10px] text-signal-ok">
                    Verified
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink-muted">{v.emirate}</div>
                <div className="mt-2 line-clamp-2 text-xs text-ink-muted">{v.store_address}</div>
                <div className="mt-auto pt-3 text-xs font-medium text-ink">
                  {items.length === 0
                    ? "No listings yet"
                    : `${items.length} ${items.length === 1 ? "listing" : "listings"}`}
                </div>
              </div>
            </Link>
          );
        })}

        {(vendors ?? []).length === 0 && (
          <p className="text-sm text-ink-muted">No verified vendors yet.</p>
        )}
      </div>
    </div>
  );
}

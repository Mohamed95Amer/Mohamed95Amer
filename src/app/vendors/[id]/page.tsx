import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VendorPage({ params }: { params: { id: string } }) {
  const supabase = getServiceSupabase();
  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, business_name, emirate, store_address, google_maps_link, verification_status")
    .eq("id", params.id)
    .single();
  if (!vendor || vendor.verification_status !== "approved") return notFound();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, karat, weight_grams")
    .eq("vendor_id", params.id)
    .eq("product_status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="container-pro py-10">
      <div className="card p-6">
        <span className="pill border-signal-ok/30 bg-signal-ok/10 text-signal-ok">Verified</span>
        <h1 className="mt-3 font-serif text-3xl">{vendor.business_name}</h1>
        <p className="text-sm text-ink-muted">{vendor.emirate} · {vendor.store_address}</p>
        {vendor.google_maps_link && (
          <a className="text-sm underline" href={vendor.google_maps_link} target="_blank" rel="noreferrer">
            View on Google Maps
          </a>
        )}
      </div>

      <h2 className="mt-10 font-serif text-2xl">Listings</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(products ?? []).map((p) => (
          <Link key={p.id} href={`/products/${p.id}`} className="card p-5 hover:border-gold-300 transition">
            <div className="text-xs uppercase tracking-wide text-ink-muted">{p.category} · {p.karat}K</div>
            <h3 className="mt-1 font-serif text-xl">{p.name}</h3>
            <p className="text-sm text-ink-muted">{p.weight_grams}g</p>
          </Link>
        ))}
        {(products ?? []).length === 0 && <p className="text-ink-muted">No active listings.</p>}
      </div>
    </div>
  );
}

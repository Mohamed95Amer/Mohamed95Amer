import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VendorsListPage() {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("vendors")
    .select("id, business_name, emirate, store_address")
    .eq("verification_status", "approved")
    .order("business_name");

  return (
    <div className="container-pro py-10">
      <h1 className="font-serif text-3xl">Verified vendors</h1>
      <p className="text-sm text-ink-muted">Every vendor below has passed trade-license and identity verification.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {(data ?? []).map((v) => (
          <Link key={v.id} href={`/vendors/${v.id}`} className="card p-5 hover:border-gold-300 transition">
            <div className="font-medium">{v.business_name}</div>
            <div className="text-xs text-ink-muted mt-1">{v.emirate}</div>
            <div className="text-xs text-ink-muted mt-2 line-clamp-2">{v.store_address}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

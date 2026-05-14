import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({ searchParams }: { searchParams: { filter?: string } }) {
  const admin = getServiceSupabase();
  let q = admin
    .from("products")
    .select("id, name, category, karat, weight_grams, product_status, updated_at, vendor:vendors(business_name)")
    .order("updated_at", { ascending: false });
  if (searchParams.filter) q = q.eq("product_status", searchParams.filter);
  const { data } = await q;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">Product</th>
            <th className="px-4 py-2 text-left">Vendor</th>
            <th className="px-4 py-2 text-right">Karat / weight</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Updated</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => {
            const v = p.vendor as unknown as { business_name: string } | null;
            return (
              <tr key={p.id} className="border-t border-bone-deep">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">{v?.business_name ?? "—"}</td>
                <td className="px-4 py-2 text-right">{p.karat}K · {p.weight_grams}g</td>
                <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{p.product_status}</span></td>
                <td className="px-4 py-2 text-ink-muted">{new Date(p.updated_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-right"><Link href={`/admin/products/${p.id}`} className="underline">Review</Link></td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No products.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

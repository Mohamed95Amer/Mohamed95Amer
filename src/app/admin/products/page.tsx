import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";

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
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">Listing approvals</h2><p className="mt-1 text-sm text-ink-muted">Check product evidence, pricing inputs and publication state.</p></div><div className="flex flex-wrap gap-2">{[["", "All"], ["pending_approval", "Pending"], ["approved", "Approved"], ["draft", "Draft"], ["rejected", "Rejected"], ["suspended", "Suspended"]].map(([value, label]) => <Link key={value} href={value ? `/admin/products?filter=${value}` : "/admin/products"} className={`pill min-h-9 px-3 ${searchParams.filter === value || (!searchParams.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div></div>
      <div className="card mt-5 overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
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
                <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(p.product_status)}</span></td>
                <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(p.updated_at)}</td>
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
    </div>
  );
}

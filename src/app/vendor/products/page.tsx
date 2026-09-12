import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { statusLabel } from "@/lib/presentation";
import { formatAed } from "@/lib/pricing/calc";

export const dynamic = "force-dynamic";

export default async function VendorProductsPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, verification_status")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const { data: products } = await admin
    .from("products")
    .select("id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, quantity, product_status, updated_at")
    .eq("vendor_id", vendor.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="container-pro py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">My products</h1>
        <Link href="/vendor/products/new" className="btn-primary">+ Add product</Link>
      </div>
      <VendorNav />
      <div className="card mt-6 overflow-x-auto">
        <table className="min-w-[820px] w-full text-sm">
          <thead className="bg-bone-soft text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-right">Karat</th>
              <th className="px-4 py-2 text-right">Weight (g)</th>
              <th className="px-4 py-2 text-right">Item making</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id} className="border-t border-bone-deep">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">{p.category}</td>
                <td className="px-4 py-2 text-right">{p.karat}K</td>
                <td className="px-4 py-2 text-right">{p.weight_grams}</td>
                <td className="px-4 py-2 text-right">
                  <span className="font-medium">{formatAed(Number(p.making_charge))}</span>
                  {Number(p.making_charge_discount_percent) > 0 && <span className="ml-1.5 text-[10px] font-semibold text-gold-600">{p.making_charge_discount_percent}% off</span>}
                </td>
                <td className="px-4 py-2 text-right">{p.quantity}</td>
                <td className="px-4 py-2">
                  <span className="pill border-bone-deep bg-bone-soft">{statusLabel(p.product_status)}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/vendor/products/${p.id}`} className="underline">Edit</Link>
                </td>
              </tr>
            ))}
            {(products ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-muted">No products yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

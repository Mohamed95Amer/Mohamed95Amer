import Link from "next/link";
import { requireUser, getCurrentProfile } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireUser();
  const profile = await getCurrentProfile();
  const admin = getServiceSupabase();
  const { data: reservations } = await admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, product:products(name, karat, weight_grams), snapshot:order_price_snapshots(total_price_aed, gold_price_per_gram_24k_aed, gold_price_fetched_at)",
    )
    .eq("customer_user_id", profile!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="container-pro py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">My account</h1>
          <p className="text-sm text-ink-muted">Hi {profile?.full_name || profile?.email}</p>
        </div>
        <SignOutButton />
      </div>

      <h2 className="mt-10 font-serif text-2xl">My reservations</h2>
      <div className="mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bone-soft text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-left">Locked until</th>
              <th className="px-4 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {(reservations ?? []).map((r) => {
              const product = r.product as unknown as { name: string; karat: number; weight_grams: number } | null;
              const snap = (r.snapshot as unknown as { total_price_aed: number }[] | { total_price_aed: number } | null);
              const total = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
              return (
                <tr key={r.id} className="border-t border-bone-deep">
                  <td className="px-4 py-2">
                    {product?.name} · {product?.karat}K · {product?.weight_grams}g
                  </td>
                  <td className="px-4 py-2">
                    <span className="pill border-bone-deep bg-bone-soft">{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{formatAed(total)}</td>
                  <td className="px-4 py-2 text-ink-muted">{new Date(r.expires_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <Link href={`/account/reservations/${r.id}`} className="underline text-sm">Open</Link>
                  </td>
                </tr>
              );
            })}
            {(reservations ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">No reservations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

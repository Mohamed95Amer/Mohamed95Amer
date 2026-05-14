import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";

export const dynamic = "force-dynamic";

export default async function ReservationDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: r } = await admin
    .from("reservations")
    .select("*, product:products(name, karat, weight_grams), snapshot:order_price_snapshots(*)")
    .eq("id", params.id)
    .single();
  if (!r) return notFound();
  if (r.customer_user_id !== user.id) return notFound();

  const product = r.product as unknown as { name: string; karat: number; weight_grams: number } | null;
  const snapArr = r.snapshot as unknown as Array<Record<string, number | string>> | null;
  const snap = Array.isArray(snapArr) ? snapArr[0] : (snapArr as unknown as Record<string, number | string> | null);

  return (
    <div className="container-pro py-10 max-w-2xl">
      <h1 className="font-serif text-3xl">Reservation</h1>
      <p className="text-sm text-ink-muted">ID: {r.id}</p>

      <div className="card mt-6 p-6 space-y-2">
        <p><span className="text-ink-muted">Product:</span> {product?.name} · {product?.karat}K · {product?.weight_grams}g</p>
        <p><span className="text-ink-muted">Status:</span> <span className="pill border-bone-deep bg-bone-soft">{r.status}</span></p>
        <p><span className="text-ink-muted">Quantity:</span> {r.quantity}</p>
        <p><span className="text-ink-muted">Locked until:</span> {new Date(r.expires_at).toLocaleString()}</p>
      </div>

      {snap && (
        <div className="card mt-6 p-6">
          <h2 className="font-serif text-xl">Locked price (server-snapshotted)</h2>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-muted">Gold value</dt>
            <dd className="text-right">{formatAed(Number(snap.gold_value_aed))}</dd>
            <dt className="text-ink-muted">Making</dt>
            <dd className="text-right">{formatAed(Number(snap.making_charge))}</dd>
            <dt className="text-ink-muted">Stone</dt>
            <dd className="text-right">{formatAed(Number(snap.stone_value))}</dd>
            <dt className="text-ink-muted">Vendor premium</dt>
            <dd className="text-right">{formatAed(Number(snap.vendor_premium))}</dd>
            <dt className="text-ink-muted">Platform fee</dt>
            <dd className="text-right">{formatAed(Number(snap.platform_fee))}</dd>
            <dt className="text-ink-muted">Delivery</dt>
            <dd className="text-right">{formatAed(Number(snap.delivery_fee))}</dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-medium">{formatAed(Number(snap.total_price_aed))}</dd>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Locked gold price: {formatAed(Number(snap.gold_price_per_gram_24k_aed))}/g 24K ·
            tick fetched {new Date(snap.gold_price_fetched_at as string).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

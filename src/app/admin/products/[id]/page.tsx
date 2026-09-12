import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminProductActions } from "./AdminProductActions";

export const dynamic = "force-dynamic";

export default async function AdminProductDetail({ params }: { params: { id: string } }) {
  const admin = getServiceSupabase();
  const { data: p } = await admin
    .from("products")
    .select("*, vendor:vendors(id, business_name, verification_status)")
    .eq("id", params.id)
    .single();
  if (!p) return notFound();
  const v = p.vendor as unknown as { id: string; business_name: string; verification_status: string } | null;

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-serif text-2xl">{p.name}</h2>
        <p className="text-sm text-ink-muted">
          {p.category} · {p.karat}K · {p.weight_grams}g · qty {p.quantity}
        </p>
        {v && (
          <p className="text-sm mt-2">
            Vendor: <span className="font-medium">{v.business_name}</span>{" "}
            <span className="pill border-bone-deep bg-bone-soft ml-2">{v.verification_status}</span>
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-muted">Making</dt><dd>{p.making_charge}</dd>
          <dt className="text-ink-muted">Making discount</dt><dd>{p.making_charge_discount_percent}%</dd>
          <dt className="text-ink-muted">Offer ends</dt><dd>{p.making_charge_offer_ends_at ? new Date(p.making_charge_offer_ends_at).toLocaleString("en-AE", { timeZone: "Asia/Dubai" }) : "—"}</dd>
          <dt className="text-ink-muted">Certificate / assay fee</dt><dd>{p.certificate_fee}</dd>
          <dt className="text-ink-muted">Stone</dt><dd>{p.stone_value}</dd>
          <dt className="text-ink-muted">Vendor premium</dt><dd>{p.vendor_premium}</dd>
          <dt className="text-ink-muted">Certificate</dt><dd>{p.certificate_number ?? "—"}</dd>
          <dt className="text-ink-muted">Hallmark</dt><dd>{p.hallmark_info ?? "—"}</dd>
        </dl>
        {p.description && <p className="mt-3 text-ink leading-relaxed">{p.description}</p>}
      </div>
      <div className="card p-6">
        <h3 className="font-serif text-xl">Decision</h3>
        <AdminProductActions productId={p.id} currentStatus={p.product_status} />
      </div>
    </div>
  );
}

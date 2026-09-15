import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminProductActions } from "./AdminProductActions";
import { ProductImage } from "@/components/ProductImage";

export const dynamic = "force-dynamic";

export default async function AdminProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getServiceSupabase();
  const { data: p } = await admin
    .from("products")
    .select("*, vendor:vendors(id, business_name, verification_status)")
    .eq("id", id)
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
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-jade-950">Vendor-supplied photos</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(Array.isArray(p.images) ? p.images : []).map((image: string, index: number) => (
              <div key={`${image}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-jade-900/10 bg-bone-soft">
                <ProductImage category={p.category} karat={p.karat} name={`${p.name} photo ${index + 1}`} images={[image]} sizes="240px" />
              </div>
            ))}
            {(!Array.isArray(p.images) || p.images.length === 0) && <p className="text-sm text-ink-muted">No photos uploaded; customers see the category illustration.</p>}
          </div>
        </div>
      </div>
      <div className="card p-6">
        <h3 className="font-serif text-xl">Decision</h3>
        {Array.isArray(p.data_quality_issues) && p.data_quality_issues.length > 0 && (
          <div className="mt-3 rounded-xl border border-signal-err/20 bg-signal-err/5 p-4 text-sm text-signal-err">
            <p className="font-semibold">Approval is blocked until these issues are fixed:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {p.data_quality_issues.map((issue: { code?: string; message?: string }, index: number) => (
                <li key={`${issue.code ?? "issue"}-${index}`}>{issue.message ?? issue.code ?? "Invalid listing data"}</li>
              ))}
            </ul>
          </div>
        )}
        <AdminProductActions productId={p.id} currentStatus={p.product_status} />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminVendorActions } from "./AdminVendorActions";
import { AdminDocViewerClient } from "@/components/AdminDocViewerClient";

export const dynamic = "force-dynamic";

export default async function AdminVendorDetail({ params }: { params: { id: string } }) {
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("*").eq("id", params.id).single();
  if (!vendor) return notFound();

  const { data: docs } = await admin
    .from("vendor_documents")
    .select("id, doc_type, original_filename, storage_path, mime_type, size_bytes, uploaded_at")
    .eq("vendor_id", vendor.id)
    .order("uploaded_at", { ascending: false });

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">{vendor.business_name}</h2>
            <p className="text-sm text-ink-muted">{vendor.emirate} · {vendor.store_address}</p>
          </div>
          <span className="pill border-bone-deep bg-bone-soft">{vendor.verification_status}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-muted">Owner</dt><dd>{vendor.owner_name}</dd>
          <dt className="text-ink-muted">Email</dt><dd>{vendor.email}</dd>
          <dt className="text-ink-muted">Phone</dt><dd>{vendor.phone}</dd>
          <dt className="text-ink-muted">License #</dt><dd>{vendor.trade_license_number}</dd>
          <dt className="text-ink-muted">License expiry</dt><dd>{vendor.license_expiry_date}</dd>
          <dt className="text-ink-muted">VAT TRN</dt><dd>{vendor.vat_trn_number ?? "—"}</dd>
        </dl>
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-xl">Documents</h3>
        <ul className="mt-4 divide-y divide-bone-deep">
          {(docs ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{d.original_filename ?? d.storage_path}</div>
                <div className="text-xs text-ink-muted">{d.doc_type} · {d.mime_type} · {d.size_bytes ? Math.round(d.size_bytes/1024) : 0} KB</div>
              </div>
              <AdminDocViewerClient path={d.storage_path} />
            </li>
          ))}
          {(docs ?? []).length === 0 && <li className="py-3 text-ink-muted">No documents uploaded.</li>}
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-xl">Decision</h3>
        <p className="text-sm text-ink-muted mt-1">Approve, reject or suspend this vendor. Approval is required before they can publish products.</p>
        <div className="mt-4">
          <AdminVendorActions vendorId={vendor.id} currentStatus={vendor.verification_status} />
        </div>
      </div>
    </div>
  );
}

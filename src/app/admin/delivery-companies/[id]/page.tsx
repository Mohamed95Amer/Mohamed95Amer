import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { statusLabel } from "@/lib/presentation";
import { AdminDeliveryCompanyActions } from "./AdminDeliveryCompanyActions";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryCompanyDetail({ params }: { params: { id: string } }) {
  const admin = getServiceSupabase();
  const { data: company } = await admin.from("delivery_companies").select("*").eq("id", params.id).maybeSingle();
  if (!company) return notFound();

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">{company.company_name}</h2><p className="mt-1 text-sm text-ink-muted">Serving {company.emirates_served.join(", ")}</p></div><span className="pill border-bone-deep bg-bone-soft">{statusLabel(company.verification_status)}</span></div>
        <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-ink-muted">Contact</dt><dd>{company.contact_name}</dd><dt className="text-ink-muted">Email</dt><dd className="break-all">{company.email}</dd>
          <dt className="text-ink-muted">Phone</dt><dd>{company.phone}</dd><dt className="text-ink-muted">Licence</dt><dd>{company.trade_license_number}</dd>
          <dt className="text-ink-muted">Licence expiry</dt><dd>{company.license_expiry_date}</dd><dt className="text-ink-muted">Website</dt><dd>{company.website ?? "—"}</dd>
        </dl>
        {company.service_notes && <div className="mt-5 rounded-2xl bg-jade-50 p-4 text-sm leading-relaxed text-ink-muted">{company.service_notes}</div>}
      </section>
      <section className="card p-6"><h3 className="font-serif text-xl font-semibold text-jade-950">Decision</h3><p className="mt-1 text-sm text-ink-muted">Approval verifies the company profile. It does not assign orders or expose customer information.</p><div className="mt-4"><AdminDeliveryCompanyActions deliveryCompanyId={company.id} currentStatus={company.verification_status} /></div></section>
    </div>
  );
}

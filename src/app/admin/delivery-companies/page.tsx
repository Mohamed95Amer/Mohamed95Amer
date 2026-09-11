import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryCompaniesPage({ searchParams }: { searchParams: { filter?: string } }) {
  const admin = getServiceSupabase();
  let query = admin.from("delivery_companies").select("id, company_name, emirates_served, verification_status, created_at").order("created_at", { ascending: false });
  if (searchParams.filter) query = query.eq("verification_status", searchParams.filter);
  const { data } = await query;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-serif text-2xl font-semibold text-jade-950">Delivery company verification</h2><p className="mt-1 text-sm text-ink-muted">Review licensed logistics partners before any future order assignment.</p></div>
        <div className="flex flex-wrap gap-2">{[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["suspended", "Suspended"]].map(([value, label]) => <Link key={value} href={value ? `/admin/delivery-companies?filter=${value}` : "/admin/delivery-companies"} className={`pill min-h-9 px-3 ${searchParams.filter === value || (!searchParams.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div>
      </div>
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-bone-soft text-ink-muted"><tr><th className="px-4 py-2 text-left">Company</th><th className="px-4 py-2 text-left">Coverage</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Created</th><th className="px-4 py-2" /></tr></thead>
          <tbody>
            {(data ?? []).map((company) => <tr key={company.id} className="border-t border-bone-deep"><td className="px-4 py-3 font-medium">{company.company_name}</td><td className="px-4 py-3">{company.emirates_served.join(", ")}</td><td className="px-4 py-3"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(company.verification_status)}</span></td><td className="px-4 py-3 text-ink-muted">{formatDubaiDateTime(company.created_at)}</td><td className="px-4 py-3 text-right"><Link href={`/admin/delivery-companies/${company.id}`} className="font-semibold text-jade-700 underline">Review</Link></td></tr>)}
            {(data ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-muted">No delivery companies.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { getActiveVendorPromotionMap } from "@/lib/marketing";

export const dynamic = "force-dynamic";

export default async function AdminVendorsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const filters = await searchParams;
  const admin = getServiceSupabase();
  let q = admin.from("vendors").select("id, business_name, emirate, verification_status, created_at").order("created_at", { ascending: false });
  if (filters.filter) q = q.eq("verification_status", filters.filter);
  const { data } = await q;
  const promoted = await getActiveVendorPromotionMap((data ?? []).map((vendor) => vendor.id));
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">Vendor verification</h2><p className="mt-1 text-sm text-ink-muted">Review business applications and current marketplace access.</p></div><div className="flex flex-wrap items-center gap-2"><a href={filters.filter ? `/api/admin/vendors/export?status=${encodeURIComponent(filters.filter)}` : "/api/admin/vendors/export"} className="btn-ghost min-h-9 px-3 text-xs">Export Excel CSV ↓</a>{[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["suspended", "Suspended"]].map(([value, label]) => <Link key={value} href={value ? `/admin/vendors?filter=${value}` : "/admin/vendors"} className={`pill min-h-9 px-3 ${filters.filter === value || (!filters.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div></div>
      <div className="card mt-5 overflow-x-auto">
      <table className="min-w-[660px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">Business</th>
            <th className="px-4 py-2 text-left">Emirate</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Placement</th>
            <th className="px-4 py-2 text-left">Created</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((v) => (
            <tr key={v.id} className="border-t border-bone-deep">
              <td className="px-4 py-2 font-medium">{v.business_name}</td>
              <td className="px-4 py-2">{v.emirate}</td>
              <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(v.verification_status)}</span></td>
              <td className="px-4 py-2">{promoted.has(v.id) ? <span className="pill border-gold-300/50 bg-gold-50 text-gold-700">Ad · until {new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short" }).format(new Date(promoted.get(v.id)!.endsAt))}</span> : <span className="text-ink-muted">Organic</span>}</td>
              <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(v.created_at)}</td>
              <td className="px-4 py-2 text-right"><Link href={`/admin/vendors/${v.id}`} className="underline">Review</Link></td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No vendors.</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

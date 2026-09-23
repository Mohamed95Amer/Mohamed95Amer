import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { getActiveVendorPromotionMap } from "@/lib/marketing";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminVendorsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const filters = await searchParams;
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  let q = admin.from("vendors").select("id, business_name, emirate, verification_status, created_at, store_latitude, store_longitude, contact_first_name, phone, trade_license_number, number_of_stores, delivery_available, online_payment_available").order("created_at", { ascending: false });
  if (filters.filter) q = q.eq("verification_status", filters.filter);
  const { data } = await q;
  const vendorIds = (data ?? []).map((vendor) => vendor.id);
  const [promoted, paymentResult] = await Promise.all([
    getActiveVendorPromotionMap(vendorIds),
    vendorIds.length
      ? admin.from("vendor_payment_settings").select("vendor_id, destination_verification_status").in("vendor_id", vendorIds)
      : Promise.resolve({ data: [] as { vendor_id: string; destination_verification_status: string }[] }),
  ]);
  const paymentReview = new Map((paymentResult.data ?? []).map((row) => [row.vendor_id, row.destination_verification_status]));
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">{arabic ? "مراجعة المتاجر" : "Vendor verification"}</h2><p className="mt-1 text-sm text-ink-muted">{arabic ? "راجع طلبات النشاط والوصول الحالي إلى السوق." : "Review business applications and current marketplace access."}</p></div><div className="flex flex-wrap items-center gap-2"><a href={filters.filter ? `/api/admin/vendors/export?status=${encodeURIComponent(filters.filter)}` : "/api/admin/vendors/export"} className="btn-ghost min-h-9 px-3 text-xs">{arabic ? "تصدير CSV لإكسل ↓" : "Export Excel CSV ↓"}</a>{(arabic ? [["", "الكل"], ["pending", "قيد المراجعة"], ["approved", "معتمد"], ["rejected", "مرفوض"], ["suspended", "موقوف"]] : [["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["suspended", "Suspended"]]).map(([value, label]) => <Link key={value} href={value ? `/admin/vendors?filter=${value}` : "/admin/vendors"} className={`pill min-h-9 px-3 ${filters.filter === value || (!filters.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div></div>
      <div className="card mt-5 overflow-x-auto">
      <table className="min-w-[660px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">{arabic ? "النشاط" : "Business"}</th>
            <th className="px-4 py-2 text-left">{arabic ? "الإمارة" : "Emirate"}</th>
            <th className="px-4 py-2 text-left">{arabic ? "الحالة" : "Status"}</th>
            <th className="px-4 py-2 text-left">{arabic ? "الجاهزية" : "Readiness"}</th>
            <th className="px-4 py-2 text-left">{arabic ? "تاريخ الطلب" : "Created"}</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((v) => (
            <tr key={v.id} className="border-t border-bone-deep">
              <td className="px-4 py-2 font-medium">{v.business_name}</td>
              <td className="px-4 py-2">{v.emirate}</td>
              <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(v.verification_status)}</span></td>
              <td className="px-4 py-2"><div className="flex flex-wrap gap-1">{promoted.has(v.id) && <span className="pill border-gold-300/50 bg-gold-50 text-gold-700">{arabic ? "إعلان · حتى " : "Ad · until "}{new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short" }).format(new Date(promoted.get(v.id)!.endsAt))}</span>}{paymentReview.get(v.id) === "pending" && <span className="pill border-gold-300/50 bg-gold-50 text-gold-800">{arabic ? "راجع وجهة الدفع" : "Payment review"}</span>}{paymentReview.get(v.id) === "rejected" && <span className="pill border-signal-err/20 bg-red-50 text-signal-err">{arabic ? "وجهة مرفوضة" : "Destination rejected"}</span>}<span className={`pill ${v.store_latitude != null && v.store_longitude != null ? "border-signal-ok/30 bg-signal-ok/10 text-signal-ok" : "border-signal-warn/30 bg-signal-warn/10 text-signal-warn"}`}>{v.store_latitude != null && v.store_longitude != null ? (arabic ? "الدبوس محفوظ" : "Pin saved") : (arabic ? "أضف الدبوس" : "Pin needed")}</span></div><span className="mt-1 block text-xs text-ink-muted">{[v.contact_first_name, v.phone, v.trade_license_number, v.delivery_available || v.online_payment_available].filter(Boolean).length}/4 {arabic ? "خطوات جاهزية" : "onboarding checks"}</span></td>
              <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(v.created_at)}</td>
              <td className="px-4 py-2 text-right"><Link href={`/admin/vendors/${v.id}`} className="underline">{arabic ? "مراجعة" : "Review"}</Link></td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">{arabic ? "لا توجد متاجر." : "No vendors."}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

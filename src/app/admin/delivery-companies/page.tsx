import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryCompaniesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const filters = await searchParams;
  const admin = getServiceSupabase();
  let query = admin.from("delivery_companies").select("id, company_name, emirates_served, verification_status, created_at").order("created_at", { ascending: false });
  if (filters.filter) query = query.eq("verification_status", filters.filter);
  const { data } = await query;

  return (
    <div dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-serif text-2xl font-semibold text-jade-950">{t("Delivery company verification", "التحقق من شركات التوصيل")}</h2><p className="mt-1 text-sm text-ink-muted">{t("Review licensed logistics partners before any future order assignment.", "راجع شركاء التوصيل المرخّصين قبل إسناد أي طلبات لهم.")}</p></div>
        <div className="flex flex-wrap gap-2">{[["", t("All", "الكل")], ["pending", t("Pending", "قيد المراجعة")], ["approved", t("Approved", "معتمدة")], ["rejected", t("Rejected", "مرفوضة")], ["suspended", t("Suspended", "موقوفة")]].map(([value, label]) => <Link key={value} href={value ? `/admin/delivery-companies?filter=${value}` : "/admin/delivery-companies"} className={`pill min-h-9 px-3 ${filters.filter === value || (!filters.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div>
      </div>
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-bone-soft text-ink-muted"><tr><th className="px-4 py-2 text-start">{t("Company", "الشركة")}</th><th className="px-4 py-2 text-start">{t("Coverage", "التغطية")}</th><th className="px-4 py-2 text-start">{t("Status", "الحالة")}</th><th className="px-4 py-2 text-start">{t("Created", "تاريخ الإنشاء")}</th><th className="px-4 py-2" /></tr></thead>
          <tbody>
            {(data ?? []).map((company) => <tr key={company.id} className="border-t border-bone-deep"><td className="px-4 py-3 font-medium">{company.company_name}</td><td className="px-4 py-3">{company.emirates_served.join(", ")}</td><td className="px-4 py-3"><span className="pill border-bone-deep bg-bone-soft">{ar ? ({ pending: "قيد المراجعة", approved: "معتمدة", rejected: "مرفوضة", suspended: "موقوفة" } as Record<string,string>)[company.verification_status] ?? statusLabel(company.verification_status) : statusLabel(company.verification_status)}</span></td><td className="px-4 py-3 text-ink-muted">{formatDubaiDateTime(company.created_at)}</td><td className="px-4 py-3 text-end"><Link href={`/admin/delivery-companies/${company.id}`} className="font-semibold text-jade-700 underline">{t("Review", "مراجعة")}</Link></td></tr>)}
            {(data ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-muted">{t("No delivery companies.", "لا توجد شركات توصيل.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

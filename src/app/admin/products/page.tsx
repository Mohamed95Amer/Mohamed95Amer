import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const filters = await searchParams;
  const admin = getServiceSupabase();
  let q = admin
    .from("products")
    .select("id, name, category, karat, weight_grams, product_status, updated_at, vendor:vendors(business_name)")
    .order("updated_at", { ascending: false });
  if (filters.filter) q = q.eq("product_status", filters.filter);
  const { data } = await q;
  return (
    <div dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">{t("Listing approvals", "اعتماد المنتجات")}</h2><p className="mt-1 text-sm text-ink-muted">{t("Check product evidence, pricing inputs and publication state.", "راجع صور المنتج ومدخلات السعر وحالة النشر.")}</p></div><div className="flex flex-wrap gap-2">{[["", t("All", "الكل")], ["pending_approval", t("Pending", "قيد المراجعة")], ["approved", t("Approved", "معتمد")], ["draft", t("Draft", "مسودة")], ["rejected", t("Rejected", "مرفوض")], ["suspended", t("Suspended", "موقوف")]].map(([value, label]) => <Link key={value} href={value ? `/admin/products?filter=${value}` : "/admin/products"} className={`pill min-h-9 px-3 ${filters.filter === value || (!filters.filter && !value) ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-ink-muted"}`}>{label}</Link>)}</div></div>
      <div className="card mt-5 overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-start">{t("Product", "المنتج")}</th>
            <th className="px-4 py-2 text-start">{t("Vendor", "المتجر")}</th>
            <th className="px-4 py-2 text-end">{t("Karat / weight", "العيار / الوزن")}</th>
            <th className="px-4 py-2 text-start">{t("Status", "الحالة")}</th>
            <th className="px-4 py-2 text-start">{t("Updated", "آخر تحديث")}</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => {
            const v = p.vendor as unknown as { business_name: string } | null;
            return (
              <tr key={p.id} className="border-t border-bone-deep">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">{v?.business_name ?? "—"}</td>
                <td className="px-4 py-2 text-end">{ar ? `عيار ${p.karat} · ${p.weight_grams} غ` : `${p.karat}K · ${p.weight_grams}g`}</td>
                <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{ar ? ({ pending_approval: "قيد المراجعة", approved: "معتمد", draft: "مسودة", rejected: "مرفوض", suspended: "موقوف" } as Record<string,string>)[p.product_status] ?? statusLabel(p.product_status) : statusLabel(p.product_status)}</span></td>
                <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(p.updated_at)}</td>
                <td className="px-4 py-2 text-end"><Link href={`/admin/products/${p.id}`} className="underline">{t("Review", "مراجعة")}</Link></td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">{t("No products.", "لا توجد منتجات.")}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

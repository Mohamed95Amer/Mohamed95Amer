import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { isAcceptedDeliveryMapLink } from "@/lib/fulfilment";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AccountVisitsPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const admin = getServiceSupabase();
  const { data: visits } = await admin.from("store_visit_requests").select("*, product:products(name, karat, weight_grams), vendor:vendors(business_name, store_address, google_maps_link)").eq("customer_user_id", user.id).order("created_at", { ascending: false });
  return <main className="container-pro py-10" dir={ar ? "rtl" : "ltr"}><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">{t("No-pressure discovery", "تصفح دون التزام")}</p><h1 className="mt-1 font-serif text-4xl text-jade-950">{t("Store visits", "زيارات المتاجر")}</h1></div><Link href="/marketplace" className="btn-primary">{t("Browse products", "تصفح المنتجات")}</Link></div><div className="mt-7 grid gap-4 lg:grid-cols-2">{(visits ?? []).map((visit) => { const product = Array.isArray(visit.product) ? visit.product[0] : visit.product; const vendor = Array.isArray(visit.vendor) ? visit.vendor[0] : visit.vendor; const safeMap = isAcceptedDeliveryMapLink(vendor?.google_maps_link) ? vendor?.google_maps_link : null; return <article key={visit.id} className="card p-5"><div className="flex justify-between gap-3"><div><h2 className="font-serif text-xl text-jade-950">{product?.name}</h2><p className="text-sm text-ink-muted">{vendor?.business_name}</p></div><span className="pill border-jade-900/10 bg-jade-50">{ar ? ({ pending: "قيد الانتظار", confirmed: "مؤكدة", declined: "مرفوضة", cancelled: "ملغاة", completed: "مكتملة" } as Record<string, string>)[visit.status] ?? statusLabel(visit.status) : statusLabel(visit.status)}</span></div><p className="mt-3 text-sm"><strong>{t("Preferred:", "الوقت المفضل:")}</strong> {formatDubaiDateTime(visit.preferred_at)}</p><p className="mt-1 text-sm text-ink-muted">{vendor?.store_address}</p>{safeMap && <a href={safeMap} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-jade-700 underline">{t("Open store map", "افتح خريطة المتجر")}</a>}<p className="mt-3 text-xs text-ink-muted">{t("This visit request does not reserve stock or lock a price.", "طلب الزيارة لا يحجز المنتج ولا يثبت السعر.")}</p></article>; })}{(visits ?? []).length === 0 && <p className="card p-6 text-ink-muted">{t("No store visits requested yet.", "لم تطلب زيارة متجر بعد.")}</p>}</div></main>;
}

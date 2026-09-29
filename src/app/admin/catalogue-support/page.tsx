import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminCatalogueSupportActions } from "@/components/AdminCatalogueSupportActions";
import { statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminCatalogueSupportPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const { data: requests } = await admin.from("catalogue_support_requests").select("*, vendor:vendors(business_name, emirate, phone, email)").order("created_at", { ascending: false });
  return <div dir={arabic ? "rtl" : "ltr"}><p className="eyebrow text-jade-600">{t("Supply activation", "تفعيل المتاجر")}</p><h2 className="mt-1 font-serif text-3xl text-jade-950">{t("Managed catalogue onboarding", "المساعدة في تجهيز الكتالوج")}</h2><p className="mt-2 text-sm text-ink-muted">{t("Prepare 10–20 accurate launch listings with each store and remove catalogue maintenance as an adoption blocker.", "جهّز 10–20 منتجاً دقيقاً عند انضمام كل متجر لتسهيل بدء البيع وإدارة الكتالوج.")}</p><div className="mt-6 grid gap-4 lg:grid-cols-2">{(requests ?? []).map((request) => { const vendor = Array.isArray(request.vendor) ? request.vendor[0] : request.vendor; return <article key={request.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-xl text-jade-950">{vendor?.business_name ?? t("Vendor", "متجر")}</h3><p className="text-xs text-ink-muted">{vendor?.emirate} · {vendor?.email} · {vendor?.phone}</p></div><span className="pill border-jade-900/10 bg-jade-50">{arabic ? ({ requested: "تم الطلب", scheduled: "تمت الجدولة", in_progress: "جارٍ العمل", completed: "مكتمل", cancelled: "ملغى" } as Record<string,string>)[request.status] ?? statusLabel(request.status) : statusLabel(request.status)}</span></div><p className="mt-3 text-sm"><strong>{request.target_listing_count} {t("products", "منتجات")}</strong></p>{request.notes && <p className="mt-2 text-sm text-ink-muted">{request.notes}</p>}<AdminCatalogueSupportActions requestId={request.id} currentStatus={request.status} initialNote={request.admin_note} arabic={arabic} /></article>; })}{(requests ?? []).length === 0 && <p className="card p-6 text-ink-muted">{t("No onboarding requests.", "لا توجد طلبات مساعدة في تجهيز الكتالوج.")}</p>}</div></div>;
}

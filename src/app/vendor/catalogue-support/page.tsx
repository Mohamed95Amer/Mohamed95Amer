import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { CatalogueSupportForm } from "@/components/CatalogueSupportForm";
import { statusLabel } from "@/lib/presentation";
export const dynamic = "force-dynamic";
export default async function VendorCatalogueSupportPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin.from("vendors").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load store.");
  if (!vendor) redirect("/vendor/register");
  const { data: requests, error: requestError } = await admin.from("catalogue_support_requests").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false });
  if (requestError) throw new Error("Could not load support requests.");
  const active = (requests ?? []).find(r => ["requested", "scheduled", "in_progress"].includes(r.status));
  const label = (status: string) => ar ? ({ requested: "تم الطلب", scheduled: "تمت الجدولة", in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغى" } as Record<string, string>)[status] ?? statusLabel(status) : statusLabel(status);
  return <div className="container-pro py-8 sm:py-10"><p className="eyebrow text-jade-600">{t("A little help getting started", "مساعدة في البداية")}</p><h1 className="mt-2 font-serif text-3xl sm:text-4xl">{t("Let’s build your catalogue", "لنجهّز كتالوج متجرك")}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{t("Get help preparing your first 10–20 listings from the product information you already have.", "احصل على مساعدة في تجهيز أول ١٠–٢٠ منتجاً باستخدام المعلومات المتوفرة لديك.")}</p><VendorNav arabic={ar} /><div className="grid items-start gap-6 lg:grid-cols-2"><section className="rounded-2xl bg-jade-950 p-6 text-white"><h2 className="font-serif text-2xl">{t("Have these ready", "جهّز هذه المعلومات")}</h2><ul className="mt-5 space-y-4 text-sm leading-relaxed text-white/80">{[t("Clear photos of each real item.", "صور واضحة لكل منتج فعلي."), t("Karat, net weight and the available quantity.", "العيار والوزن الصافي والكمية المتوفرة."), t("Your making charge and certificate details.", "المصنعية وبيانات الشهادة.")].map((item, i) => <li key={item} className="flex gap-3"><span className="text-gold-200">0{i + 1}</span>{item}</li>)}</ul><p className="mt-6 border-t border-white/20 pt-4 text-xs text-white/70">{t("The Get Gold team reviews your request and arranges the next step.", "يراجع فريق Get Gold طلبك وينسّق الخطوة التالية.")}</p></section>{active ? <section className="card p-6"><p className="eyebrow text-jade-600">{t("Request received", "تم استلام الطلب")}</p><h2 className="mt-2 font-serif text-2xl">{active.target_listing_count} {t("products", "منتجاً")}</h2><span className="pill mt-3 border-jade-900/10 bg-jade-50">{label(active.status)}</span><p className="mt-4 text-sm text-ink-muted">{active.admin_note || t("Our team will review your request and contact you about the next step.", "سيراجع فريقنا طلبك ويتواصل معك بشأن الخطوة التالية.")}</p></section> : <CatalogueSupportForm arabic={ar} />}</div>{!!requests?.length && <details className="card mt-6 p-5"><summary className="cursor-pointer font-serif text-xl">{t("Request history", "سجل الطلبات")}</summary><ul className="mt-3 divide-y divide-jade-900/10 text-sm">{requests.map(r => <li key={r.id} className="flex justify-between gap-4 py-3"><span>{r.target_listing_count} {t("products", "منتجاً")}</span><span>{label(r.status)}</span></li>)}</ul></details>}</div>;
}

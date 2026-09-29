import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { DeliveryCompanyForm } from "./DeliveryCompanyForm";
import { statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery company onboarding", robots: { index: false, follow: false } };

export default async function DeliveryRegisterPage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("delivery_companies").select("*").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!profile || !["customer", "delivery_company"].includes(profile.role)) redirect("/profile");

  return (
    <div className="container-pro max-w-4xl py-10 sm:py-14" dir={arabic ? "rtl" : "ltr"}>
      <p className="eyebrow text-jade-600">{t("Logistics partner onboarding", "انضمام شركاء التوصيل")}</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{t("Create your delivery company profile", "أنشئ ملف شركة التوصيل")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">{t("Submit the licensed business and service-area details Get Gold needs to review before assigning any jewellery deliveries.", "قدّم بيانات النشاط المرخّص ومناطق الخدمة لمراجعتها قبل إسناد أي توصيلات مجوهرات.")}</p>
      {existing && <div className="mt-6 rounded-2xl border border-jade-900/10 bg-jade-50 p-4 text-sm"><span className="font-semibold text-jade-950">{t("Current status:", "الحالة الحالية:")}</span> {arabic ? ({ approved: "معتمدة", pending: "قيد المراجعة", rejected: "مرفوضة", suspended: "موقوفة" } as Record<string,string>)[existing.verification_status] ?? statusLabel(existing.verification_status) : statusLabel(existing.verification_status)}. {t("Editing and resubmitting sends the profile back for review.", "تعديل الملف وإعادة إرساله يعيده إلى المراجعة.")}</div>}
      <div className="card mt-6 p-6 sm:p-8"><DeliveryCompanyForm initial={existing ?? null} arabic={arabic} /></div>
    </div>
  );
}

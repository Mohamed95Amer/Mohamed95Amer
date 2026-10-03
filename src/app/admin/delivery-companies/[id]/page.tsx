import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { statusLabel } from "@/lib/presentation";
import { AdminDeliveryCompanyActions } from "./AdminDeliveryCompanyActions";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryCompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const { id } = await params;
  const admin = getServiceSupabase();
  const { data: company } = await admin.from("delivery_companies").select("*").eq("id", id).maybeSingle();
  if (!company) return notFound();

  return (
    <div className="grid gap-6" dir={ar ? "rtl" : "ltr"}>
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl font-semibold text-jade-950">{company.company_name}</h2><p className="mt-1 text-sm text-ink-muted">{t("Serving", "تغطي")} {company.emirates_served.join(", ")}</p></div><span className="pill border-bone-deep bg-bone-soft">{ar ? ({ pending: "قيد المراجعة", approved: "معتمدة", rejected: "مرفوضة", suspended: "موقوفة" } as Record<string,string>)[company.verification_status] ?? statusLabel(company.verification_status) : statusLabel(company.verification_status)}</span></div>
        <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-ink-muted">{t("Contact", "جهة الاتصال")}</dt><dd>{company.contact_name}</dd><dt className="text-ink-muted">{t("Email", "البريد الإلكتروني")}</dt><dd className="break-all" dir="ltr">{company.email}</dd>
          <dt className="text-ink-muted">{t("Phone", "الهاتف")}</dt><dd dir="ltr">{company.phone}</dd><dt className="text-ink-muted">{t("Licence", "الرخصة")}</dt><dd>{company.trade_license_number}</dd>
          <dt className="text-ink-muted">{t("Licence expiry", "انتهاء الرخصة")}</dt><dd>{company.license_expiry_date}</dd><dt className="text-ink-muted">{t("Website", "الموقع الإلكتروني")}</dt><dd>{company.website ?? "—"}</dd>
        </dl>
        {company.service_notes && <div className="mt-5 rounded-2xl bg-jade-50 p-4 text-sm leading-relaxed text-ink-muted">{company.service_notes}</div>}
      </section>
      <section className="card p-6"><h3 className="font-serif text-xl font-semibold text-jade-950">{t("Decision", "القرار")}</h3><p className="mt-1 text-sm text-ink-muted">{t("Approval verifies the company profile. It does not assign orders or expose customer information.", "الاعتماد يؤكد ملف الشركة، ولا يسند الطلبات أو يكشف بيانات العملاء.")}</p><div className="mt-4"><AdminDeliveryCompanyActions deliveryCompanyId={company.id} currentStatus={company.verification_status} arabic={ar} /></div></section>
    </div>
  );
}

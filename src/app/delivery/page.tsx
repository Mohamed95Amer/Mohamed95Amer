import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { statusLabel } from "@/lib/presentation";
import { formatDubaiDateTime } from "@/lib/presentation";
import { FulfilmentDetails } from "@/components/FulfilmentDetails";
import { DeliveryStatusActions } from "@/components/DeliveryStatusActions";
import { formatAed } from "@/lib/pricing/calc";
import { dubaiTodayIso } from "@/lib/time";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery dashboard", robots: { index: false, follow: false } };

export default async function DeliveryDashboardPage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const [{ data: profile }, { data: company }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("delivery_companies").select("*").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!company) {
    if (profile && !["customer", "delivery_company"].includes(profile.role)) redirect("/profile");
    redirect("/delivery/register");
  }

  const approved = company.verification_status === "approved" && company.license_expiry_date >= dubaiTodayIso();
  const { data: assignments } = approved
    ? await admin.from("delivery_assignments").select("id, status, tracking_code, public_note, created_at, reservation:reservations(id, quantity, recipient_name, recipient_phone, delivery_emirate, delivery_area, delivery_address_line_1, delivery_address_line_2, delivery_landmark, delivery_latitude, delivery_longitude, delivery_map_link, customer_note, customer:profiles!reservations_customer_user_id_fkey(full_name), product:products(name, karat, weight_grams), vendor:vendors(business_name, phone), snapshot:order_price_snapshots(total_price_aed))").eq("delivery_company_id", company.id).order("created_at", { ascending: false })
    : { data: [] as any[] };
  const activeAssignments = (assignments ?? []).filter((assignment) => !["delivered", "declined", "cancelled"].includes(assignment.status));
  return (
    <div className="container-pro py-10 sm:py-14" dir={arabic ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow text-jade-600">{t("Delivery operations", "عمليات التوصيل")}</p><h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{company.company_name}</h1><p className="mt-2 text-sm text-ink-muted">{t("Serving", "تغطي")} {company.emirates_served.join(", ")}</p></div>
        <span className={`pill ${approved ? "border-signal-ok/30 bg-signal-ok/10 text-signal-ok" : "border-gold-400/30 bg-gold-50 text-gold-600"}`}>{arabic ? ({ approved: "معتمدة", pending: "قيد المراجعة", rejected: "مرفوضة", suspended: "موقوفة" } as Record<string,string>)[company.verification_status] ?? statusLabel(company.verification_status) : statusLabel(company.verification_status)}</span>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <section className="card p-6 md:col-span-2">
          <h2 className="font-serif text-2xl font-semibold text-jade-950">{t("Company profile", "ملف الشركة")}</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="label">{t("Primary contact", "جهة الاتصال الرئيسية")}</dt><dd className="mt-1">{company.contact_name}</dd></div>
            <div><dt className="label">{t("Operations email", "البريد الإلكتروني للعمليات")}</dt><dd className="mt-1 break-all" dir="ltr">{company.email}</dd></div>
            <div><dt className="label">{t("Operations phone", "هاتف العمليات")}</dt><dd className="mt-1" dir="ltr">{company.phone}</dd></div>
            <div><dt className="label">{t("Trade licence", "الرخصة التجارية")}</dt><dd className="mt-1">{company.trade_license_number}</dd></div>
          </dl>
          <Link href="/delivery/register" className="btn-ghost mt-6">{t("Edit company profile", "تعديل ملف الشركة")}</Link>
        </section>
        <section className="card bg-jade-950 p-6 text-white">
          <p className="eyebrow text-gold-200">{t("Delivery assignments", "مهام التوصيل")}</p>
          <p className="mt-4 font-serif text-4xl font-semibold">{activeAssignments.length}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{t("Active assignments. Customer details appear only after a vendor assigns this company to that order.", "المهام النشطة. لا تظهر بيانات العميل إلا بعد أن يعيّن المتجر هذه الشركة للطلب.")}</p>
        </section>
      </div>

      {!approved && <div className="mt-6 rounded-2xl border border-gold-400/30 bg-gold-50 p-5 text-sm text-gold-700">{t(`Your profile is ${statusLabel(company.verification_status).toLowerCase()}. No customer or order data is shared until approval and assignment.`, "ملف شركتك لم يُعتمد بعد. لا تُشارك بيانات العملاء أو الطلبات قبل الاعتماد والتعيين.")}</div>}
      {approved && <section className="mt-8"><div><p className="eyebrow text-jade-600">{t("Assigned work", "المهام المسندة")}</p><h2 className="mt-1 font-serif text-3xl font-semibold text-jade-950">{t("Deliveries", "التوصيلات")}</h2></div><div className="mt-5 space-y-4">{(assignments ?? []).map((assignment) => { const reservation = assignment.reservation as any; const customer = Array.isArray(reservation?.customer) ? reservation.customer[0] : reservation?.customer; const product = Array.isArray(reservation?.product) ? reservation.product[0] : reservation?.product; const vendor = Array.isArray(reservation?.vendor) ? reservation.vendor[0] : reservation?.vendor; const snapshot = Array.isArray(reservation?.snapshot) ? reservation.snapshot[0] : reservation?.snapshot; return <article key={assignment.id} className="card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-jade-600">{assignment.tracking_code}</p><h3 className="mt-1 font-serif text-2xl font-semibold text-jade-950">{product?.name ?? t("Gold order", "طلب ذهب")}</h3><p className="mt-1 text-sm text-ink-muted">{t("Pickup:", "الاستلام من:")} {vendor?.business_name ?? t("Vendor", "المتجر")}{vendor?.phone ? ` · ${vendor.phone}` : ""}</p></div><div className="text-end"><span className="pill border-jade-900/10 bg-jade-50">{arabic ? ({ offered: "معروضة", accepted: "مقبولة", declined: "مرفوضة", picked_up: "تم الاستلام", out_for_delivery: "خرجت للتوصيل", delivered: "تم التسليم", delivery_failed: "فشل التسليم", retry_scheduled: "إعادة محاولة مجدولة", cancelled: "ملغاة" } as Record<string,string>)[assignment.status] ?? statusLabel(assignment.status) : statusLabel(assignment.status)}</span><p className="mt-2 text-xs text-ink-muted">{t("Assigned", "أُسندت")} {formatDubaiDateTime(assignment.created_at)}</p></div></div><div className="mt-4 grid gap-3 rounded-xl bg-jade-50 p-4 text-sm sm:grid-cols-3"><div><p className="label">{t("Recipient", "المستلم")}</p><p className="mt-1 font-semibold text-jade-950">{customer?.full_name ?? reservation?.recipient_name}</p></div><div><p className="label">{t("Quantity", "الكمية")}</p><p className="mt-1 font-semibold text-jade-950">{reservation?.quantity}</p></div><div><p className="label">{t("Declared order total", "إجمالي الطلب المعلن")}</p><p className="mt-1 font-semibold text-jade-950">{formatAed(snapshot?.total_price_aed)}</p></div></div><div className="mt-4"><FulfilmentDetails details={reservation} arabic={arabic} /></div>{assignment.public_note && <p className="mt-3 rounded-xl bg-bone-soft p-3 text-sm text-ink-muted">{t("Latest note:", "آخر ملاحظة:")} {assignment.public_note}</p>}<DeliveryStatusActions assignmentId={assignment.id} status={assignment.status} arabic={arabic} /></article>; })}{(assignments ?? []).length === 0 && <p className="card p-6 text-sm text-ink-muted">{t("No deliveries are assigned yet.", "لا توجد مهام توصيل مسندة بعد.")}</p>}</div></section>}
    </div>
  );
}

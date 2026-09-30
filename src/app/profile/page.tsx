import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/ProfileForm";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentProfile, requireUser, type AccountRole } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My profile", robots: { index: false, follow: false } };

const roleDetails: Record<AccountRole, { label: string; description: string; href: string; action: string }> = {
  customer: { label: "Customer", description: "Browse verified listings, reserve at a locked price and track purchase insights.", href: "/account", action: "View purchase history" },
  vendor: { label: "Vendor", description: "Manage your verified store, inventory, orders and buyer reputation.", href: "/vendor", action: "Open vendor dashboard" },
  delivery_company: { label: "Delivery company", description: "Maintain your verified logistics business profile and operational access.", href: "/delivery", action: "Open delivery dashboard" },
  admin: { label: "Platform administrator", description: "Review businesses, listings, orders, price operations and marketplace settings.", href: "/admin", action: "Open administration" },
  super_admin: { label: "Platform owner", description: "Full Get Gold operations and governance access.", href: "/admin", action: "Open administration" },
};
const roleDetailsAr: Record<AccountRole, { label: string; description: string; action: string }> = {
  customer: { label: "عميل", description: "تصفح المنتجات وتابع طلباتك وتحليلات مشترياتك.", action: "عرض سجل المشتريات" },
  vendor: { label: "متجر", description: "أدر متجرك الموثّق ومنتجاتك وطلباتك وتقييمات العملاء.", action: "فتح لوحة المتجر" },
  delivery_company: { label: "شركة توصيل", description: "أدر بيانات شركة التوصيل المعتمدة وعملياتها.", action: "فتح لوحة التوصيل" },
  admin: { label: "مسؤول المنصة", description: "راجع المتاجر والمنتجات والطلبات وإعدادات السوق.", action: "فتح لوحة الإدارة" },
  super_admin: { label: "مالك المنصة", description: "إدارة عمليات Get Gold وصلاحياتها.", action: "فتح لوحة الإدارة" },
};

export default async function ProfilePage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const role = profile.role as AccountRole;
  const details = roleDetails[role] ?? roleDetails.customer;
  const detailsAr = roleDetailsAr[role] ?? roleDetailsAr.customer;
  const admin = getServiceSupabase();
  const business = role === "vendor"
    ? (await admin.from("vendors").select("business_name, verification_status").eq("owner_user_id", user.id).maybeSingle()).data
    : role === "delivery_company"
      ? (await admin.from("delivery_companies").select("company_name, verification_status").eq("owner_user_id", user.id).maybeSingle()).data
      : null;

  return (
    <div className="container-pro py-10 sm:py-14" dir={arabic ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-jade-600">{t("Your Get Gold identity", "هويتك على Get Gold")}</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{t("Profile & access", "الملف الشخصي والصلاحيات")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{t("Your personal information is separate from any verified business profile. Your platform role can only be changed through an approved onboarding or trusted admin process.", "بياناتك الشخصية منفصلة عن بيانات النشاط التجاري الموثّق. لا تتغير صلاحية حسابك إلا عبر طلب انضمام معتمد أو إجراء إداري موثوق.")}</p>
        </div>
        <SignOutButton arabic={arabic} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="card p-6 sm:p-8">
          <p className="eyebrow text-jade-600">{t("Personal profile", "الملف الشخصي")}</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-jade-950">{t("Contact details", "بيانات التواصل")}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t("Signed in as", "مسجل الدخول باسم")} <bdi className="font-semibold text-jade-950">{profile.email}</bdi></p>
          <div className="mt-6"><ProfileForm fullName={profile.full_name ?? ""} phone={profile.phone ?? ""} arabic={arabic} /></div>
        </section>

        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="bg-jade-950 p-6 text-white">
              <p className="eyebrow text-gold-200">{t("Account type", "نوع الحساب")}</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">{arabic ? detailsAr.label : details.label}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{arabic ? detailsAr.description : details.description}</p>
            </div>
            <div className="p-6">
              {business && (
                <div className="mb-5 rounded-2xl bg-jade-50 p-4">
                  <p className="font-semibold text-jade-950">{"business_name" in business ? business.business_name : business.company_name}</p>
                  <p className="mt-1 text-xs text-ink-muted">{t("Business status", "حالة النشاط")}: {arabic ? ({ approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض", suspended: "موقوف" } as Record<string, string>)[business.verification_status] ?? business.verification_status : statusLabel(business.verification_status)}</p>
                </div>
              )}
              <Link href={details.href} className="btn-primary w-full">{arabic ? detailsAr.action : details.action}</Link>
            </div>
          </section>
          <section className="card p-6 text-sm">
            <h2 className="font-serif text-xl font-semibold text-jade-950">{t("Account security", "أمان الحساب")}</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-ink-muted">{t("Email", "البريد الإلكتروني")}</dt><dd className="text-end break-all" dir="ltr">{profile.email}</dd>
              <dt className="text-ink-muted">{t("Created", "تاريخ الإنشاء")}</dt><dd className="text-end">{arabic ? new Intl.DateTimeFormat("ar-AE", { timeZone: "Asia/Dubai", dateStyle: "medium" }).format(new Date(user.created_at)) : formatDubaiDateTime(user.created_at)}</dd>
              <dt className="text-ink-muted">{t("Role", "الصلاحية")}</dt><dd className="text-end">{arabic ? detailsAr.label : details.label}</dd>
            </dl>
            <Link href="/forgot-password" className="mt-5 inline-flex font-semibold text-jade-700 underline underline-offset-4">{t("Reset password", "إعادة تعيين كلمة المرور")}</Link>
          </section>
        </div>
      </div>
    </div>
  );
}

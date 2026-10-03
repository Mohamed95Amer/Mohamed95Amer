import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Create account", description: "Create a Get Gold customer, vendor or delivery company account.", robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string; ref?: string }> }) {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const query = await searchParams;
  const role = query.role === "vendor" ? "vendor" : query.role === "delivery_company" ? "delivery_company" : "customer";
  const referralCode = /^[A-Z0-9]{8,16}$/i.test(query.ref ?? "") ? query.ref!.toUpperCase() : undefined;
  const copy = role === "vendor"
    ? { title: t("Bring your gold shop into the live market.", "أضف متجر الذهب الخاص بك إلى السوق المباشر."), body: t("Create your account, then submit the business evidence needed for manual verification.", "أنشئ حسابك، ثم قدّم مستندات النشاط التجاري للمراجعة اليدوية.") }
    : role === "delivery_company"
      ? { title: t("Join the trusted delivery network.", "انضم إلى شبكة التوصيل الموثوقة."), body: t("Create your account, define your licensed service coverage and submit it for admin review.", "أنشئ حسابك، وحدد مناطق الخدمة المرخّصة، ثم أرسله للمراجعة.") }
      : { title: t("See the price. Get the gold.", "اعرف السعر. واحصل على الذهب."), body: t("Save locked-price history, follow comparable gold value and review completed purchases.", "احتفظ بسجل أسعار طلباتك، وتابع القيمة المقارنة للذهب ومشترياتك المكتملة.") };
  return (
    <div className="container-pro grid gap-10 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:py-16">
      <section className="lg:sticky lg:top-40">
        <p className="eyebrow text-jade-600">{t("Join Get Gold", "انضم إلى Get Gold")}</p>
        <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">{copy.title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{copy.body}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={referralCode ? `/register?ref=${referralCode}` : "/register"} className={`pill min-h-10 px-4 ${role === "customer" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>{t("Customer", "عميل")}</Link>
          <Link href="/register?role=vendor" className={`pill min-h-10 px-4 ${role === "vendor" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>{t("Vendor", "متجر")}</Link>
          <Link href="/register?role=delivery_company" className={`pill min-h-10 px-4 ${role === "delivery_company" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>{t("Delivery company", "شركة توصيل")}</Link>
        </div>
      </section>
      <section className="mx-auto w-full max-w-xl">
        <div className="card p-6 sm:p-8"><RegisterForm initialRole={role} referralCode={referralCode} arabic={arabic} /></div>
        <p className="mt-4 text-sm text-ink-muted">{t("Already have an account?", "لديك حساب بالفعل؟")} <Link href={role === "vendor" ? "/login?role=vendor&next=/vendor" : "/login"} className="font-semibold text-jade-700 underline underline-offset-4">{t("Sign in", "تسجيل الدخول")}</Link></p>
      </section>
    </div>
  );
}

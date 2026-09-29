import type { Metadata } from "next";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/auth/redirect";
import { VerifyEmailForm } from "./VerifyEmailForm";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Confirm your email",
  description: "Confirm your Get Gold email address before signing in.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const query = await searchParams;
  const email = typeof query.email === "string" && query.email.includes("@") ? query.email : "";
  const next = safeInternalRedirect(query.next);

  return (
    <div className="container-pro grid max-w-5xl gap-10 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-20">
      <section>
        <p className="eyebrow text-jade-600">{t("One quick step", "خطوة واحدة سريعة")}</p>
        <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">{t("Confirm your email to continue.", "أكّد بريدك الإلكتروني للمتابعة.")}</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{t("We use email confirmation to protect your account and keep reservation and identity records tied to the right person.", "نؤكد البريد الإلكتروني لحماية حسابك وربط سجلات الطلب والتحقق من الهوية بالشخص الصحيح.")}</p>
        <div className="mt-6 space-y-3 text-sm text-ink-muted">
          <p>{t("Open the message from Get Gold and select the confirmation link.", "افتح رسالة Get Gold واضغط رابط التأكيد.")}</p>
          <p>{t("The link returns you to the correct customer, vendor or delivery-company setup.", "سيعيدك الرابط إلى إعداد حساب العميل أو المتجر أو شركة التوصيل المناسب.")}</p>
          <p>{t("Nothing is charged and no order is created during confirmation.", "لن تُفرض رسوم ولن يُنشأ طلب خلال هذه الخطوة.")}</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-xl">
        <div className="card p-6 sm:p-8">
          <VerifyEmailForm email={email} next={next} arabic={arabic} />
        </div>
        <p className="mt-4 text-sm text-ink-muted">{t("Already confirmed?", "أكدت بريدك بالفعل؟")} <Link href="/login" className="font-semibold text-jade-700 underline underline-offset-4">{t("Sign in", "تسجيل الدخول")}</Link></p>
      </section>
    </div>
  );
}

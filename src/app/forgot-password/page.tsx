import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  return <div className="container-pro max-w-md py-16" dir={arabic ? "rtl" : "ltr"}><p className="eyebrow text-jade-600">{arabic ? "استعادة الحساب" : "Account recovery"}</p><h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{arabic ? "إعادة تعيين كلمة المرور" : "Reset your password"}</h1><p className="mt-2 text-sm leading-relaxed text-ink-muted">{arabic ? "سنرسل رابطاً آمناً إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني." : "We’ll email a secure link if an account exists for that address."}</p><div className="card mt-6 p-6"><ForgotPasswordForm arabic={arabic} /></div><p className="mt-4 text-sm text-ink-muted"><Link href="/login" className="font-semibold text-jade-700 underline underline-offset-4">{arabic ? "العودة إلى تسجيل الدخول" : "Return to sign in"}</Link></p></div>;
}

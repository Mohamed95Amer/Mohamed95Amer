import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  return <div className="container-pro max-w-md py-16" dir={arabic ? "rtl" : "ltr"}><p className="eyebrow text-jade-600">{arabic ? "أمان الحساب" : "Account security"}</p><h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{arabic ? "اختر كلمة مرور جديدة" : "Choose a new password"}</h1><p className="mt-2 text-sm text-ink-muted">{arabic ? "استخدم ١٢ حرفاً على الأقل وكلمة مرور فريدة لا تستعملها لحساب آخر." : "Use at least 12 characters and a unique password you do not use elsewhere."}</p><div className="card mt-6 p-6"><ResetPasswordForm arabic={arabic} /></div></div>;
}

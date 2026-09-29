"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { safeInternalRedirect } from "@/lib/auth/redirect";
import Link from "next/link";
import { TurnstileField } from "@/components/security/TurnstileField";

export function LoginForm({ next, error: initialError, arabic = false }: { next?: string; error?: string; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const needsEmailVerification = Boolean(error && /email\s+not\s+confirmed|confirm\s+your\s+email/i.test(error));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken ?? undefined } });
    setBusy(false);
    setCaptchaResetKey((key) => key + 1);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(safeInternalRedirect(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="login-email">{t("Email address", "البريد الإلكتروني")}</label>
        <input id="login-email" name="email" className="input" dir="ltr" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label className="label" htmlFor="login-password">{t("Password", "كلمة المرور")}</label>
          <Link href="/forgot-password" className="text-xs font-semibold text-jade-700 hover:text-jade-500" dir={arabic ? "rtl" : "ltr"}>{t("Forgot password?", "نسيت كلمة المرور؟")}</Link>
        </div>
        <div className="relative">
          <input id="login-password" name="password" className="input pe-16" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute end-3 top-1/2 min-h-9 -translate-y-[42%] text-xs font-semibold text-jade-700" aria-label={showPassword ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}>{showPassword ? t("Hide", "إخفاء") : t("Show", "إظهار")}</button>
        </div>
      </div>
      <TurnstileField onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />
      {error && <div id="login-error" role="alert" className="space-y-2 text-sm"><p className="text-signal-err">{arabic ? /email\s+not\s+confirmed|confirm\s+your\s+email/i.test(error) ? "يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول." : /invalid login credentials/i.test(error) ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مجدداً." : error}</p>{needsEmailVerification && <Link href={`/register/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeInternalRedirect(next))}`} className="inline-block font-semibold text-jade-700 underline underline-offset-4">{t("Resend confirmation email", "إعادة إرسال رسالة تأكيد البريد")}</Link>}</div>}
      <button type="submit" className="btn-primary w-full" disabled={busy || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !captchaToken)}>{busy ? t("Signing in…", "جارٍ تسجيل الدخول…") : t("Sign in", "تسجيل الدخول")}</button>
    </form>
  );
}

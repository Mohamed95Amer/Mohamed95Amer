"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Link from "next/link";
import { TurnstileField } from "@/components/security/TurnstileField";

type RegistrationRole = "customer" | "vendor" | "delivery_company";

const destination: Record<RegistrationRole, string> = {
  customer: "/account",
  vendor: "/vendor/register",
  delivery_company: "/delivery/register",
};

export function RegisterForm({ initialRole = "customer", referralCode, arabic = false }: { initialRole?: RegistrationRole; referralCode?: string; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RegistrationRole>(initialRole);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: captchaToken ?? undefined,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination[role])}`,
        data: { full_name: fullName, phone, role, referral_code: referralCode },
      },
    });
    setBusy(false);
    setCaptchaResetKey((key) => key + 1);
    if (error) {
      setErr(error.message);
      return;
    }
    const emailConfirmed = Boolean(data.user?.email_confirmed_at);
    if (!data.session || !emailConfirmed) {
      // Do not leave an auto-confirmed or partially-created session active while
      // asking the user to verify. This keeps the flow safe if Auth settings
      // differ between local, preview and production projects.
      if (data.session) await supabase.auth.signOut();
      router.push(`/register/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(destination[role])}`);
      return;
    }
    router.push(destination[role]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="register-name">{t("Full name", "الاسم الكامل")}</label>
        <input id="register-name" name="name" className="input" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      {referralCode && role === "customer" && <p className="rounded-xl bg-jade-50 p-3 text-xs text-jade-700">{t(`Invitation code ${referralCode} will be linked after signup.`, `سيُربط رمز الدعوة ${referralCode} بحسابك بعد التسجيل.`)}</p>}
      <div>
        <label className="label" htmlFor="register-phone">{t("UAE phone number", "رقم هاتف إماراتي")}</label>
        <input id="register-phone" name="phone" className="input" type="tel" required autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="register-email">{t("Email address", "البريد الإلكتروني")}</label>
        <input id="register-email" name="email" className="input" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="register-password">{t("Password", "كلمة المرور")}</label>
        <div className="relative">
          <input id="register-password" name="new-password" className="input pr-16" type={showPassword ? "text" : "password"} required minLength={12} autoComplete="new-password" aria-describedby="register-password-help" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 min-h-9 -translate-y-[42%] text-xs font-semibold text-jade-700" aria-label={showPassword ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}>{showPassword ? t("Hide", "إخفاء") : t("Show", "إظهار")}</button>
        </div>
        <p id="register-password-help" className="mt-1.5 text-xs text-ink-muted">{t("Use at least 12 characters and a unique password you do not use elsewhere.", "استخدم 12 حرفًا على الأقل وكلمة مرور لا تستخدمها في مكان آخر.")}</p>
      </div>
      <div>
        <label className="label" htmlFor="register-role">{t("Account type", "نوع الحساب")}</label>
        <select id="register-role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as RegistrationRole)}>
          <option value="customer">{t("Customer (browse & reserve)", "عميل (تصفح واطلب)")}</option>
          <option value="vendor">{t("Vendor (list gold shop)", "متجر (اعرض منتجات الذهب)")}</option>
          <option value="delivery_company">{t("Delivery company (fulfil orders)", "شركة توصيل (نفّذ الطلبات)")}</option>
        </select>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-muted">
        <input name="terms" type="checkbox" required className="mt-1 h-4 w-4 rounded border-jade-900/20 text-jade-700" />
        <span>{t("I agree to the", "أوافق على")} <Link href="/terms" className="font-semibold text-jade-700 underline underline-offset-4">{t("Terms", "الشروط")}</Link> {t("and acknowledge the", "وأقرّ بالاطلاع على")} <Link href="/privacy" className="font-semibold text-jade-700 underline underline-offset-4">{t("Privacy Policy", "سياسة الخصوصية")}</Link>.</span>
      </label>
      <TurnstileField onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
      {msg && <p role="status" className="text-sm text-signal-ok">{msg}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !captchaToken)}>{busy ? t("Creating account…", "جارٍ إنشاء الحساب…") : role === "vendor" ? t("Create vendor account", "إنشاء حساب متجر") : role === "delivery_company" ? t("Create delivery company account", "إنشاء حساب شركة توصيل") : t("Create customer account", "إنشاء حساب عميل")}</button>
    </form>
  );
}

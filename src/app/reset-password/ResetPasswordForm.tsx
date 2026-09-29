"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function ResetPasswordForm({ arabic = false }: { arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError(t("Passwords do not match.", "كلمتا المرور غير متطابقتين."));
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(arabic ? "تعذر تحديث كلمة المرور. أعد فتح رابط الاستعادة أو حاول مجدداً." : updateError.message);
    router.push("/account");
    router.refresh();
  }

  return <form onSubmit={submit} className="space-y-4"><div><label htmlFor="new-password" className="label">{t("New password", "كلمة المرور الجديدة")}</label><input id="new-password" name="new-password" type="password" className="input" minLength={12} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><p className="mt-1.5 text-xs text-ink-muted">{t("Use at least 12 characters and a unique password.", "استخدم ١٢ حرفاً على الأقل وكلمة مرور فريدة.")}</p></div><div><label htmlFor="confirm-password" className="label">{t("Confirm new password", "تأكيد كلمة المرور الجديدة")}</label><input id="confirm-password" name="confirm-password" type="password" className="input" minLength={12} required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>{error && <p role="alert" className="text-sm text-signal-err">{error}</p>}<button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? t("Updating…", "جارٍ التحديث…") : t("Set new password", "حفظ كلمة المرور الجديدة")}</button></form>;
}

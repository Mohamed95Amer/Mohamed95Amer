"use client";

import Link from "next/link";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { safeInternalRedirect } from "@/lib/auth/redirect";
import { TurnstileField } from "@/components/security/TurnstileField";

export function VerifyEmailForm({ email: initialEmail, next: initialNext }: { email: string; next: string }) {
  const supabase = getBrowserSupabase();
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const next = safeInternalRedirect(initialNext);

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, captchaToken: captchaToken ?? undefined },
    });
    setBusy(false);
    setCaptchaResetKey((key) => key + 1);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setMessage("A fresh confirmation link is on its way. Check your inbox and spam folder.");
  }

  return (
    <form onSubmit={resend} className="space-y-5">
      <div>
        <p className="eyebrow text-jade-600">Email confirmation</p>
        <h2 className="mt-2 font-serif text-3xl font-semibold text-jade-950">Check your inbox.</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">We sent a confirmation link to the address below. You must confirm it before signing in.</p>
      </div>
      <div>
        <label className="label" htmlFor="verify-email">Email address</label>
        <input id="verify-email" name="email" className="input" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <TurnstileField onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />
      {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
      {message && <p role="status" className="text-sm text-signal-ok">{message}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !captchaToken)}>{busy ? "Sending link…" : "Resend confirmation email"}</button>
      <p className="text-xs leading-relaxed text-ink-muted">If you do not see it within a few minutes, check spam or use a different address. Confirmation links expire for security.</p>
      <Link href="/login" className="block text-center text-sm font-semibold text-jade-700 underline underline-offset-4">Return to sign in</Link>
    </form>
  );
}

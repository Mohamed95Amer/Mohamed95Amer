"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { TurnstileField } from "@/components/security/TurnstileField";

export function ForgotPasswordForm() {
  const supabase = getBrowserSupabase();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`, captchaToken: captchaToken ?? undefined });
    setBusy(false);
    setCaptchaResetKey((key) => key + 1);
    setMessage(error ? error.message : "If an account exists for that email, a reset link is on its way.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="reset-email" className="label">Email address</label><input id="reset-email" name="email" type="email" className="input" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <TurnstileField onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />
      {message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !captchaToken)}>{busy ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

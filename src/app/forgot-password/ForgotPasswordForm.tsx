"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const supabase = getBrowserSupabase();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    setBusy(false);
    setMessage(error ? error.message : "If an account exists for that email, a reset link is on its way.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="reset-email" className="label">Email address</label><input id="reset-email" name="email" type="email" className="input" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      {message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

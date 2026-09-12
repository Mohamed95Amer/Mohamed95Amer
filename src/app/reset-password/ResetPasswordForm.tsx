"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    router.push("/account");
    router.refresh();
  }

  return <form onSubmit={submit} className="space-y-4"><div><label htmlFor="new-password" className="label">New password</label><input id="new-password" name="new-password" type="password" className="input" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><div><label htmlFor="confirm-password" className="label">Confirm new password</label><input id="confirm-password" name="confirm-password" type="password" className="input" minLength={8} required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>{error && <p role="alert" className="text-sm text-signal-err">{error}</p>}<button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Updating…" : "Set new password"}</button></form>;
}

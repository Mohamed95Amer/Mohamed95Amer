"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Link from "next/link";

export function LoginForm({ next, error: initialError }: { next?: string; error?: string }) {
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="login-email">Email address</label>
        <input id="login-email" name="email" className="input" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label className="label" htmlFor="login-password">Password</label>
          <Link href="/forgot-password" className="text-xs font-semibold text-jade-700 hover:text-jade-500">Forgot password?</Link>
        </div>
        <div className="relative">
          <input id="login-password" name="password" className="input pr-16" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 min-h-9 -translate-y-[42%] text-xs font-semibold text-jade-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
        </div>
      </div>
      {error && <p id="login-error" role="alert" className="text-sm text-signal-err">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Link from "next/link";

type RegistrationRole = "customer" | "vendor" | "delivery_company";

const destination: Record<RegistrationRole, string> = {
  customer: "/account",
  vendor: "/vendor/register",
  delivery_company: "/delivery/register",
};

export function RegisterForm({ initialRole = "customer" }: { initialRole?: RegistrationRole }) {
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination[role])}`,
        data: { full_name: fullName, phone, role },
      },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (!data.session) {
      setMsg("Check your email to confirm your account.");
      return;
    }
    router.push(destination[role]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="register-name">Full name</label>
        <input id="register-name" name="name" className="input" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="register-phone">UAE phone number</label>
        <input id="register-phone" name="phone" className="input" type="tel" required autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="register-email">Email address</label>
        <input id="register-email" name="email" className="input" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="register-password">Password</label>
        <div className="relative">
          <input id="register-password" name="new-password" className="input pr-16" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" aria-describedby="register-password-help" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 min-h-9 -translate-y-[42%] text-xs font-semibold text-jade-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
        </div>
        <p id="register-password-help" className="mt-1.5 text-xs text-ink-muted">Use at least 8 characters. A longer, unique password is safer.</p>
      </div>
      <div>
        <label className="label" htmlFor="register-role">Account type</label>
        <select id="register-role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as RegistrationRole)}>
          <option value="customer">Customer (browse & reserve)</option>
          <option value="vendor">Vendor (list gold shop)</option>
          <option value="delivery_company">Delivery company (fulfil orders)</option>
        </select>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-muted">
        <input name="terms" type="checkbox" required className="mt-1 h-4 w-4 rounded border-jade-900/20 text-jade-700" />
        <span>I agree to the <Link href="/terms" className="font-semibold text-jade-700 underline underline-offset-4">Terms</Link> and acknowledge the <Link href="/privacy" className="font-semibold text-jade-700 underline underline-offset-4">Privacy Policy</Link>.</span>
      </label>
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
      {msg && <p role="status" className="text-sm text-signal-ok">{msg}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : role === "vendor" ? "Create vendor account" : role === "delivery_company" ? "Create delivery company account" : "Create customer account"}</button>
    </form>
  );
}

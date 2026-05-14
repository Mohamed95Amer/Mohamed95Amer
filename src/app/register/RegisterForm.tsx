"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function RegisterForm() {
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "vendor">("customer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, role } },
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
    router.push(role === "vendor" ? "/vendor/register" : "/account");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Full name</label>
        <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">Password</label>
        <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="label">I am a</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as "customer" | "vendor")}>
          <option value="customer">Customer (browse & reserve)</option>
          <option value="vendor">Vendor (list gold shop)</option>
        </select>
      </div>
      {err && <p className="text-sm text-signal-err">{err}</p>}
      {msg && <p className="text-sm text-signal-ok">{msg}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

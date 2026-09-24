"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: fullName, phone });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(typeof result.error === "string" ? result.error : "Could not update your profile.");
      return;
    }
    setMessage("Profile updated.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="profile-full-name" className="label">Full name</label>
        <input id="profile-full-name" name="full_name" className="input" required autoComplete="name" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
      </div>
      <div>
        <label htmlFor="profile-phone" className="label">Phone number</label>
        <input id="profile-phone" name="phone" type="tel" inputMode="tel" className="input" required autoComplete="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
      </div>
      {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
      {message && <p role="status" className="text-sm text-signal-ok">{message}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save personal profile"}</button>
    </form>
  );
}

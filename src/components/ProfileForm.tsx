"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({ fullName, phone, arabic = false }: { fullName: string; phone: string; arabic?: boolean }) {
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
      setError(arabic ? "تعذر تحديث ملفك الشخصي. حاول مجدداً." : typeof result.error === "string" ? result.error : "Could not update your profile.");
      return;
    }
    setMessage(arabic ? "تم تحديث الملف الشخصي." : "Profile updated.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="profile-full-name" className="label">{arabic ? "الاسم الكامل" : "Full name"}</label>
        <input id="profile-full-name" name="full_name" className="input" required autoComplete="name" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
      </div>
      <div>
        <label htmlFor="profile-phone" className="label">{arabic ? "رقم الهاتف" : "Phone number"}</label>
        <input id="profile-phone" name="phone" type="tel" inputMode="tel" dir="ltr" className="input" required autoComplete="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
      </div>
      {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
      {message && <p role="status" className="text-sm text-signal-ok">{message}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? (arabic ? "جارٍ الحفظ…" : "Saving…") : (arabic ? "حفظ البيانات الشخصية" : "Save personal profile")}</button>
    </form>
  );
}

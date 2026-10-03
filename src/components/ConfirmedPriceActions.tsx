"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConfirmedPriceActions({ reservationId, arabic = false }: { reservationId: string; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "cancel" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "accept" | "cancel") {
    if (action === "accept" && !window.confirm(t("Accept this final price and start the limited payment window?", "هل تقبل السعر النهائي وتبدأ مهلة الدفع المحدودة؟"))) return;
    setBusy(action); setError("");
    try {
      const response = await fetch("/api/reservations/confirmed-price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, action }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? body.error ?? t("Could not update this request.", "تعذر تحديث هذا الطلب.")); return; }
      router.refresh();
    } catch { setError(t("Connection failed. Please retry.", "فشل الاتصال. حاول مجددًا.")); } finally { setBusy(null); }
  }

  return <div className="mt-5 flex flex-wrap items-center gap-3">
    <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => act("accept")}>{busy === "accept" ? t("Accepting…", "جارٍ القبول…") : t("Accept price & continue", "قبول السعر والمتابعة")}</button>
    <button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => act("cancel")}>{busy === "cancel" ? t("Cancelling…", "جارٍ الإلغاء…") : t("Cancel request", "إلغاء الطلب")}</button>
    {error && <p role="alert" className="w-full text-sm text-signal-err">{error}</p>}
  </div>;
}

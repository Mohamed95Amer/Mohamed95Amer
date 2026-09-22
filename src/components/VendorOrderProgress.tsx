"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "confirm_payment_received" | "start_preparing" | "mark_ready" | "mark_out_for_delivery" | "mark_delivered" | "complete";

export function VendorOrderProgress({ reservationId, status, paymentMethod, fulfilmentMethod, arabic = false }: { reservationId: string; status: string; paymentMethod: string; fulfilmentMethod: string; arabic?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action: { value: Action; label: string; confirm?: string } | null =
    ((status === "payment_verification" && ["bank_transfer", "aani"].includes(paymentMethod)) || (status === "payment_pending" && !["bank_transfer", "aani"].includes(paymentMethod)))
      ? { value: "confirm_payment_received", label: "Confirm payment received", confirm: "Confirm only after the money is visible as cleared in the store’s own account." }
      : status === "payment_confirmed" ? { value: "start_preparing", label: "Start preparing order" }
      : status === "preparing_order" ? { value: "mark_ready", label: fulfilmentMethod === "collection" ? "Ready for collection" : "Ready for delivery" }
      : status === "ready_for_delivery" && fulfilmentMethod === "delivery" ? { value: "mark_out_for_delivery", label: "Mark out for delivery" }
      : status === "out_for_delivery" ? { value: "mark_delivered", label: "Mark delivered" }
      : (status === "delivered" || (status === "ready_for_delivery" && fulfilmentMethod === "collection")) ? { value: "complete", label: "Complete order" }
      : null;

  if (!action) return null;
  const labels: Record<Action, string> = { confirm_payment_received: "تأكيد استلام المبلغ", start_preparing: "بدء تجهيز الطلب", mark_ready: fulfilmentMethod === "collection" ? "جاهز للاستلام" : "جاهز للتوصيل", mark_out_for_delivery: "خرج للتوصيل", mark_delivered: "تأكيد التسليم", complete: "إكمال الطلب" };
  async function progress() {
    if (action?.confirm && !window.confirm(arabic ? "أكد فقط بعد التحقق من استلام المبلغ فعلياً." : action.confirm)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/vendor/reservations/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, action: action?.value }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(arabic ? "تعذر تحديث الطلب. حدّث الصفحة وحاول مرة أخرى." : body.error ?? "Could not update this order."); return; }
      router.refresh();
    } catch { setError(arabic ? "تعذر الاتصال. حاول مرة أخرى." : "Connection failed. Please retry."); } finally { setBusy(false); }
  }
  return <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="btn-primary min-h-11 w-full px-4 py-2 text-sm" onClick={progress} disabled={busy}>{busy ? (arabic ? "جارٍ التحديث…" : "Updating…") : arabic ? labels[action.value] : action.label}</button>{error && <span role="alert" className="text-xs text-signal-err">{error}</span>}</div>;
}

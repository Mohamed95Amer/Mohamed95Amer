"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DELIVERY_ACTIONS } from "@/lib/delivery/transitions";

export function DeliveryStatusActions({ assignmentId, status, arabic = false }: { assignmentId: string; status: string; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState("");
  const options = DELIVERY_ACTIONS[status] ?? [];
  async function act(next: string) {
    if (next === "delivered" && !proof.trim()) {
      setError(t("Add a delivery proof reference before marking this order delivered.", "أضف مرجع إثبات التسليم قبل وضع علامة تم التسليم."));
      return;
    }
    setBusy(next);
    setError(null);
    try {
      const response = await fetch("/api/delivery/assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, status: next, publicNote: note || null, proofReference: next === "delivered" ? proof.trim() : null }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(arabic ? "تعذر تحديث حالة التوصيل. حدّث الصفحة وحاول مجدداً." : json.message ?? "Could not update delivery. Refresh and try again.");
        return;
      }
      router.refresh();
    } catch {
      setError(t("Connection interrupted. Refresh to check the latest delivery status before retrying.", "انقطع الاتصال. حدّث الصفحة للتحقق من أحدث حالة قبل إعادة المحاولة."));
    } finally {
      setBusy(null);
    }
  }
  if (options.length === 0) return null;
  return <div className="mt-4">
    <label className="label" htmlFor={`delivery-note-${assignmentId}`}>{t("Customer-visible update", "تحديث يظهر للعميل")}</label>
    <input id={`delivery-note-${assignmentId}`} className="input mt-1" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Optional delivery update", "تحديث اختياري للتوصيل")} />
    {status === "out_for_delivery" && <div className="mt-3">
      <label className="label" htmlFor={`delivery-proof-${assignmentId}`}>{t("Delivery proof reference (required to complete)", "مرجع إثبات التسليم (مطلوب للإكمال)")}</label>
      <input id={`delivery-proof-${assignmentId}`} className="input mt-1" maxLength={500} value={proof} onChange={(event) => setProof(event.target.value)} aria-describedby={`delivery-proof-help-${assignmentId}`} placeholder={t("Courier proof-of-delivery reference", "مرجع إيصال التسليم")} />
      <p id={`delivery-proof-help-${assignmentId}`} className="mt-1 text-xs text-ink-muted">{t("Enter the courier’s receipt reference, not an identity document number or a customer’s OTP.", "أدخل مرجع إيصال شركة التوصيل، لا رقم مستند هوية أو رمز تحقق خاص بالعميل.")}</p>
    </div>}
    <div className="mt-3 flex flex-wrap gap-2">{options.map(([next, label]) => <button key={next} type="button" className={next === "declined" || next === "delivery_failed" ? "btn-ghost text-xs" : "btn-primary text-xs"} onClick={() => act(next)} disabled={Boolean(busy)}>{busy === next ? t("Updating…", "جارٍ التحديث…") : arabic ? ({ accepted: "قبول المهمة", declined: "رفض المهمة", picked_up: "تم الاستلام من المتجر", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", delivery_failed: "فشل التسليم", retry_scheduled: "جدولة إعادة المحاولة" } as Record<string, string>)[next] ?? label : label}</button>)}</div>
    {error && <p role="alert" className="mt-2 text-xs text-signal-err">{error}</p>}
  </div>;
}

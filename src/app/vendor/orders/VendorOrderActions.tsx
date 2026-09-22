"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function VendorOrderActions({ reservationId, estimatedTotalAed, availableAt, arabic = false }: { reservationId: string; estimatedTotalAed: number; availableAt: string; arabic?: boolean }) {
  const router = useRouter();
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [finalTotal, setFinalTotal] = useState(estimatedTotalAed.toFixed(2));
  const queued = Date.parse(availableAt) > Date.now();
  async function act(decision: "confirm" | "reject") {
    if (decision === "reject" && !window.confirm(t("Decline this purchase request? The customer will need to choose another item.", "هل تريد رفض طلب الشراء؟ سيحتاج العميل إلى اختيار منتج آخر."))) return;
    if (decision === "confirm" && (!Number.isFinite(Number(finalTotal)) || Number(finalTotal) <= 0)) { setErr(t("Enter a valid final price.", "أدخل سعراً نهائياً صحيحاً.")); return; }
    setBusy(decision); setErr(null);
    try {
      const res = await fetch("/api/vendor/reservations/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, decision, ...(decision === "confirm" ? { finalTotalAed: Number(finalTotal) } : {}) }) });
      if (!res.ok) { setErr(t("Could not update this request. Refresh the page and check whether it is still open.", "تعذر تحديث الطلب. حدّث الصفحة وتحقق من أن الطلب لا يزال متاحاً.")); return; }
      router.refresh();
    } catch { setErr(t("Connection failed. Your price is still here; please retry.", "تعذر الاتصال. السعر محفوظ هنا؛ حاول مرة أخرى.")); } finally { setBusy(null); }
  }
  if (queued) return <p className="text-sm text-ink-muted">{t("Queued until the store opens. Refresh at opening time to confirm.", "بانتظار فتح المتجر. حدّث الصفحة عند موعد الفتح للتأكيد.")}</p>;
  return <div className="space-y-3"><label className="block"><span className="label">{t("Final customer total (AED)", "الإجمالي النهائي للعميل (درهم)")}</span><input className="input mt-1" dir="ltr" type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" value={finalTotal} onChange={e => setFinalTotal(e.target.value)} /></label><p className="text-xs leading-relaxed text-ink-muted">{t("Check the item is available. Include the fees, VAT and delivery for this order in your final total. The customer will review your price before paying.", "تحقق من توفر المنتج. ضمّن الرسوم والضريبة والتوصيل في الإجمالي النهائي. سيراجع العميل سعرك قبل الدفع.")}</p><button type="button" className="btn-primary w-full" disabled={busy !== null} onClick={() => act("confirm")}>{busy === "confirm" ? t("Sending…", "جارٍ الإرسال…") : t("Confirm item & send price", "تأكيد المنتج وإرسال السعر")}</button><button type="button" className="btn-ghost w-full text-sm" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? t("Updating…", "جارٍ التحديث…") : t("Item unavailable · decline", "المنتج غير متوفر · رفض")}</button>{err && <p role="alert" className="text-sm text-signal-err">{err}</p>}</div>;
}

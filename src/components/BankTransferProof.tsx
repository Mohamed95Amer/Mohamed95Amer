"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function BankTransferProof({ reservationId, submitted, arabic = false }: { reservationId: string; submitted: boolean; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter(); const [busy,setBusy] = useState(false); const [message,setMessage] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); form.set("reservationId", reservationId); setBusy(true);
    try { const response = await fetch("/api/reservations/bank-proof", { method: "POST", body: form }); const body = await response.json(); setMessage(response.ok ? t("Proof submitted. Waiting for the store to verify receipt of funds.", "تم إرسال إثبات الدفع. ننتظر تحقق المتجر من استلام المبلغ.") : body.error); if (response.ok) router.refresh(); }
    catch { setMessage(t("Connection failed. Check the order before retrying.", "فشل الاتصال. تحقق من حالة الطلب قبل إعادة المحاولة.")); } finally { setBusy(false); }
  }
  if (submitted) return <p className="mt-4 text-sm">{t("Payment marked as sent — waiting for the store to check its own account.", "تم تحديد الدفع كمرسل — ننتظر تحقق المتجر من حسابه البنكي.")}</p>;
  return <form className="mt-4 space-y-3" onSubmit={upload}><label className="block"><span className="label">{t("Transaction reference (optional)", "مرجع التحويل (اختياري)")}</span><input name="reference" className="input" maxLength={120} /></label><label className="block"><span className="label">{t("Payment screenshot (optional, PDF, PNG or JPEG; maximum 5 MB)", "صورة إثبات الدفع (اختياري، PDF أو PNG أو JPEG؛ بحد أقصى 5 ميغابايت)")}</span><input name="proof" type="file" accept="application/pdf,image/png,image/jpeg" className="mt-2 block w-full text-sm" /></label><p className="text-xs text-ink-muted">{t("A screenshot helps the store locate the transfer but never confirms payment. Hide your balance and unrelated transactions. Never upload passwords, OTPs or identity documents.", "تساعد الصورة المتجر في العثور على التحويل لكنها لا تؤكد الدفع. أخفِ رصيدك والتحويلات غير المرتبطة. لا ترفع كلمات المرور أو رموز التحقق أو مستندات الهوية.")}</p><button disabled={busy} className="btn-primary">{busy ? t("Submitting…", "جارٍ الإرسال…") : t("I have paid", "لقد دفعت")}</button><p role="status" className="text-sm">{message}</p></form>;
}

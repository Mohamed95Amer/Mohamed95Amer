"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function VendorReviewReplyForm({ reviewId, initialReply, arabic = false }: { reviewId: string; initialReply: string | null; arabic?: boolean }) {
  const router = useRouter();
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [reply, setReply] = useState(initialReply ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/vendor/reviews/${reviewId}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply }) });
      if (!response.ok) { setMessage(t("Could not save the response. Please retry.", "تعذر حفظ الرد. حاول مرة أخرى.")); return; }
      setMessage(t("Your response is published.", "تم نشر ردك.")); router.refresh();
    } catch { setMessage(t("Connection failed. Your reply is still here; please retry.", "تعذر الاتصال. ردك ما زال هنا؛ حاول مرة أخرى.")); } finally { setBusy(false); }
  }
  return <details className="mt-4 rounded-xl bg-jade-50 p-4"><summary className="cursor-pointer text-sm font-semibold">{initialReply ? t("View or edit your response", "عرض ردك أو تعديله") : t("Respond to this review", "الرد على هذا التقييم")}</summary><form onSubmit={submit} className="mt-4">
    <label className="label" htmlFor={`reply-${reviewId}`}>{t("Your public store response", "رد المتجر العلني")}</label>
    <textarea id={`reply-${reviewId}`} className="input mt-2 min-h-24 text-sm" minLength={2} maxLength={1000} required value={reply} onChange={e => setReply(e.target.value)} placeholder={t("Thank the buyer and answer constructively. Never include private order details.", "اشكر العميل ورد بشكل بنّاء. لا تشارك بيانات الطلب الخاصة.")} />
    <div className="mt-3 flex flex-wrap items-center gap-3"><button className="btn-primary min-h-11 px-4 py-2 text-xs" disabled={busy}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Publish response", "نشر الرد")}</button><span className="text-xs text-ink-muted">{reply.length}/1000</span>{message && <span className="text-xs text-ink-muted" role="status">{message}</span>}</div>
  </form></details>;
}

"use client";

import { useState } from "react";

export function ReviewReportButton({ reviewId, arabic = false }: { reviewId: string; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/reviews/${reviewId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details: details.trim() || null }),
    });
    setBusy(false);

    if (response.status === 401) {
      setMessage(t("Sign in to report a review.", "سجل الدخول للإبلاغ عن التقييم."));
      return;
    }
    if (response.status === 409) {
      setMessage(t("You already reported this review.", "لقد أبلغت عن هذا التقييم مسبقًا."));
      return;
    }
    if (!response.ok) {
      setMessage(t("Could not send the report. Please try again.", "تعذر إرسال البلاغ. حاول مجددًا."));
      return;
    }

    setOpen(false);
    setMessage(t("Report sent for admin review.", "أُرسل البلاغ لمراجعة الإدارة."));
  }

  return (
    <div className="text-end">
      {!open ? (
        <button type="button" className="text-[11px] text-ink-muted underline-offset-2 hover:text-jade-700 hover:underline" onClick={() => setOpen(true)}>
          {t("Report review", "الإبلاغ عن التقييم")}
        </button>
      ) : (
        <div className="w-full max-w-sm rounded-xl bg-jade-50 p-3 text-start">
          <label htmlFor={`report-reason-${reviewId}`} className="text-xs font-bold uppercase tracking-wide text-ink-muted">{t("Reason", "السبب")}</label>
          <select id={`report-reason-${reviewId}`} name="reason" className="input mt-1" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="spam">{t("Spam", "محتوى مزعج")}</option>
            <option value="fake_or_misleading">{t("Fake or misleading", "مضلل أو غير حقيقي")}</option>
            <option value="abusive">{t("Abusive language", "لغة مسيئة")}</option>
            <option value="personal_information">{t("Personal information", "معلومات شخصية")}</option>
            <option value="other">{t("Other", "سبب آخر")}</option>
          </select>
          <textarea
            id={`report-details-${reviewId}`}
            name="details"
            aria-label={t("Optional report details", "تفاصيل البلاغ الاختيارية")}
            className="input mt-2 min-h-20"
            maxLength={1000}
            placeholder={t("Optional details", "تفاصيل اختيارية")}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button>
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={submit}>
              {busy ? t("Sending…", "جارٍ الإرسال…") : t("Send report", "إرسال البلاغ")}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}

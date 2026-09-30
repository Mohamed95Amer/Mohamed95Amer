"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action =
  | "publish_review"
  | "hide_review"
  | "publish_reply"
  | "hide_reply"
  | "dismiss_report"
  | "action_report";

export function AdminReviewActions({ reviewId, reportId, arabic = false }: { reviewId: string; reportId?: string; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(action: Action) {
    setBusy(action);
    setError(null);
    const response = await fetch(`/api/admin/reviews/${reviewId}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reportId: reportId ?? null, note: note.trim() || null }),
    });
    setBusy(null);
    if (!response.ok) {
      setError(t("Moderation action failed.", "تعذر تنفيذ إجراء المراجعة."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <label htmlFor={`moderation-note-${reviewId}`} className="sr-only">{t("Optional moderation note", "ملاحظة مراجعة اختيارية")}</label>
      <input id={`moderation-note-${reviewId}`} name="moderation_note" className="input" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Optional moderation note", "ملاحظة مراجعة اختيارية")} />
      <div className="mt-2 flex flex-wrap gap-2">
        {reportId ? (
          <>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("dismiss_report")}>{t("Dismiss report", "رفض البلاغ")}</button>
            <button className="rounded-full bg-signal-err px-3 py-1.5 text-xs font-semibold text-white" disabled={busy !== null} onClick={() => act("action_report")}>{t("Uphold & hide review", "اعتماد البلاغ وإخفاء التقييم")}</button>
          </>
        ) : (
          <>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("publish_review")}>{t("Publish review", "نشر التقييم")}</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("hide_review")}>{t("Hide review", "إخفاء التقييم")}</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("publish_reply")}>{t("Publish reply", "نشر الرد")}</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("hide_reply")}>{t("Hide reply", "إخفاء الرد")}</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-signal-err">{error}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type VerificationStatus = "pending" | "in_review" | "approved" | "rejected" | "error" | "expired" | "consumed";

export function IdentityVerificationDialog({
  open,
  verificationId,
  verificationUrl,
  route,
  arabic = false,
  onClose,
  onApproved,
  onStartOver,
}: {
  open: boolean;
  verificationId: string;
  verificationUrl: string;
  route: "uae_resident" | "visitor";
  arabic?: boolean;
  onClose: () => void;
  onApproved: () => void;
  onStartOver: () => void;
}) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [message, setMessage] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    const response = await fetch(`/api/identity-verifications/status?id=${verificationId}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { status?: VerificationStatus };
    if (payload.status) setStatus(payload.status);
  }, [verificationId]);

  useEffect(() => {
    if (!open || ["approved", "rejected", "expired", "error"].includes(status)) return;
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 2_500);
    return () => window.clearInterval(timer);
  }, [checkStatus, open, status]);

  if (!open) return null;

  const final = ["approved", "rejected", "expired", "error"].includes(status);
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-jade-950/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="identity-dialog-title">
      <div className="mx-auto min-h-full max-w-2xl rounded-[1.5rem] bg-white shadow-lift">
        <div className="flex items-start justify-between gap-4 border-b border-jade-900/10 px-5 py-4 sm:px-7">
          <div>
            <p className="eyebrow text-jade-600">{t("Mandatory order security", "حماية الطلب الإلزامية")}</p>
            <h2 id="identity-dialog-title" className="mt-1 font-serif text-2xl font-semibold text-jade-950">{t("Confirm who is ordering", "تأكيد هوية مقدم الطلب")}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {route === "uae_resident"
                ? t("Have the front and back of your Emirates ID ready, then complete the live face scan.", "جهّز وجهي الهوية الإماراتية ثم أكمل مسح الوجه المباشر.")
                : t("Have your passport ready, then complete the live face scan.", "جهّز جواز السفر ثم أكمل مسح الوجه المباشر.")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-jade-900/10 text-xl text-ink-muted hover:bg-jade-50" aria-label={t("Close identity verification", "إغلاق التحقق من الهوية")}>×</button>
        </div>

        <div className="p-4 sm:p-7">
          {!final && (
            <div>
              <iframe
                src={verificationUrl}
                title={t("Didit secure identity verification", "التحقق الآمن من الهوية عبر Didit")}
                allow="camera; microphone"
                referrerPolicy="strict-origin-when-cross-origin"
                className="min-h-[620px] w-full rounded-xl border border-jade-900/10 bg-bone-soft"
                onLoad={() => setMessage(null)}
                onError={() => setMessage(t("The secure Didit window could not load. Open it in a new tab or start again.", "تعذر تحميل نافذة Didit الآمنة. افتحها في تبويب جديد أو ابدأ مجددًا."))}
              />
              <p className="mt-3 text-center text-xs text-ink-muted">
                {t("Camera not opening here?", "الكاميرا لا تعمل هنا؟")}{" "}
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-jade-700 underline underline-offset-2"
                >
                  {t("Open the secure Didit check in a new tab", "افتح فحص Didit الآمن في تبويب جديد")}
                </a>
                {t(", then return here.", "، ثم عد إلى هنا.")}
              </p>
            </div>
          )}

          {status === "in_review" && <p className="mt-4 rounded-xl bg-gold-50 p-4 text-sm text-ink-muted">{t("Your documents were submitted. Waiting for the secure provider's signed result…", "تم إرسال مستنداتك. ننتظر نتيجة التحقق الموقّعة من المزود الآمن…")}</p>}
          {status === "approved" && (
            <div className="rounded-2xl border border-signal-ok/25 bg-jade-50 p-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-signal-ok text-xl font-bold text-white">✓</div>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-jade-950">{t("Identity confirmed", "تم تأكيد الهوية")}</h3>
              <p className="mt-2 text-sm text-ink-muted">{t("This check authorizes this purchase request once. The store must still confirm availability and its final current price before payment.", "يسمح هذا التحقق بتقديم طلب الشراء مرة واحدة. لا يزال على المتجر تأكيد التوفر والسعر النهائي الحالي قبل الدفع.")}</p>
              <button type="button" onClick={onApproved} className="btn-primary mt-5 w-full">{t("Send purchase request", "إرسال طلب الشراء")}</button>
            </div>
          )}
          {(status === "rejected" || status === "expired" || status === "error") && (
            <div className="rounded-2xl border border-signal-err/20 bg-red-50 p-6 text-center">
              <h3 className="font-serif text-2xl font-semibold text-jade-950">{t("Verification not completed", "لم يكتمل التحقق")}</h3>
              <p className="mt-2 text-sm text-ink-muted">{status === "expired" ? t("This per-order check expired. Start a new secure session.", "انتهت صلاحية هذا الفحص. ابدأ جلسة آمنة جديدة.") : t("The provider could not approve this check. Review the document route and try again.", "لم يتمكن المزود من الموافقة على الفحص. راجع نوع المستند وحاول مجددًا.")}</p>
              <button type="button" onClick={onStartOver} className="btn-ghost mt-5 w-full">{t("Start a new check", "بدء تحقق جديد")}</button>
            </div>
          )}
          {message && <p role="alert" className="mt-4 text-sm text-signal-err">{message}</p>}
          <p className="mt-5 border-t border-jade-900/10 pt-4 text-xs leading-relaxed text-ink-muted">
            {t("Identity document images, selfies and biometric templates are collected and processed in Didit's hosted window. Get Gold stores only Didit's verified result and its link to this order.", "تُجمع صور المستندات والصور الذاتية والبيانات الحيوية وتُعالج في نافذة Didit المستضافة. يحتفظ Get Gold بنتيجة التحقق فقط وربطها بهذا الطلب.")}
          </p>
        </div>
      </div>
    </div>
  );
}

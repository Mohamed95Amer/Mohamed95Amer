"use client";

import { useCallback, useEffect, useState } from "react";

type VerificationStatus = "pending" | "in_review" | "approved" | "rejected" | "error" | "expired" | "consumed";

export function IdentityVerificationDialog({
  open,
  verificationId,
  verificationUrl,
  route,
  onClose,
  onApproved,
  onStartOver,
}: {
  open: boolean;
  verificationId: string;
  verificationUrl: string;
  route: "uae_resident" | "visitor";
  onClose: () => void;
  onApproved: () => void;
  onStartOver: () => void;
}) {
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
            <p className="eyebrow text-jade-600">Mandatory order security</p>
            <h2 id="identity-dialog-title" className="mt-1 font-serif text-2xl font-semibold text-jade-950">Confirm who is ordering</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {route === "uae_resident"
                ? "Have the front and back of your Emirates ID ready, then complete the live face scan."
                : "Have your passport and boarding pass ready, then complete the live face scan."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-jade-900/10 text-xl text-ink-muted hover:bg-jade-50" aria-label="Close identity verification">×</button>
        </div>

        <div className="p-4 sm:p-7">
          {!final && (
            <div>
              <iframe
                src={verificationUrl}
                title="Didit secure identity verification"
                allow="camera; microphone"
                referrerPolicy="strict-origin-when-cross-origin"
                className="min-h-[620px] w-full rounded-xl border border-jade-900/10 bg-bone-soft"
                onLoad={() => setMessage(null)}
                onError={() => setMessage("The secure Didit window could not load. Open it in a new tab or start again.")}
              />
              <p className="mt-3 text-center text-xs text-ink-muted">
                Camera not opening here?{" "}
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-jade-700 underline underline-offset-2"
                >
                  Open the secure Didit check in a new tab
                </a>
                , then return here.
              </p>
            </div>
          )}

          {status === "in_review" && <p className="mt-4 rounded-xl bg-gold-50 p-4 text-sm text-ink-muted">Your documents were submitted. Waiting for the secure provider&apos;s signed result…</p>}
          {status === "approved" && (
            <div className="rounded-2xl border border-signal-ok/25 bg-jade-50 p-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-signal-ok text-xl font-bold text-white">✓</div>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-jade-950">Identity confirmed</h3>
              <p className="mt-2 text-sm text-ink-muted">This check can authorize this order once and will be consumed when the stock is claimed.</p>
              <button type="button" onClick={onApproved} className="btn-primary mt-5 w-full">Place order & lock live price</button>
            </div>
          )}
          {(status === "rejected" || status === "expired" || status === "error") && (
            <div className="rounded-2xl border border-signal-err/20 bg-red-50 p-6 text-center">
              <h3 className="font-serif text-2xl font-semibold text-jade-950">Verification not completed</h3>
              <p className="mt-2 text-sm text-ink-muted">{status === "expired" ? "This per-order check expired. Start a new secure session." : "The provider could not approve this check. Review the document route and try again."}</p>
              <button type="button" onClick={onStartOver} className="btn-ghost mt-5 w-full">Start a new check</button>
            </div>
          )}
          {message && <p role="alert" className="mt-4 text-sm text-signal-err">{message}</p>}
          <p className="mt-5 border-t border-jade-900/10 pt-4 text-xs leading-relaxed text-ink-muted">
            Document images, boarding-pass images, selfies and biometric templates are collected and processed in Didit&apos;s hosted window. Get Gold stores only Didit&apos;s verified result and its link to this order.
          </p>
        </div>
      </div>
    </div>
  );
}

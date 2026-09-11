"use client";

import { useState } from "react";

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
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
      setMessage("Sign in to report a review.");
      return;
    }
    if (response.status === 409) {
      setMessage("You already reported this review.");
      return;
    }
    if (!response.ok) {
      setMessage("Could not send the report. Please try again.");
      return;
    }

    setOpen(false);
    setMessage("Report sent for admin review.");
  }

  return (
    <div className="text-right">
      {!open ? (
        <button type="button" className="text-[11px] text-ink-muted underline-offset-2 hover:text-jade-700 hover:underline" onClick={() => setOpen(true)}>
          Report review
        </button>
      ) : (
        <div className="w-full max-w-sm rounded-xl bg-jade-50 p-3 text-left">
          <label htmlFor={`report-reason-${reviewId}`} className="text-xs font-bold uppercase tracking-wide text-ink-muted">Reason</label>
          <select id={`report-reason-${reviewId}`} name="reason" className="input mt-1" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="spam">Spam</option>
            <option value="fake_or_misleading">Fake or misleading</option>
            <option value="abusive">Abusive language</option>
            <option value="personal_information">Personal information</option>
            <option value="other">Other</option>
          </select>
          <textarea
            id={`report-details-${reviewId}`}
            name="details"
            aria-label="Optional report details"
            className="input mt-2 min-h-20"
            maxLength={1000}
            placeholder="Optional details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={submit}>
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}

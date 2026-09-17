"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VendorReviewReplyForm({ reviewId, initialReply }: { reviewId: string; initialReply: string | null }) {
  const router = useRouter();
  const [reply, setReply] = useState(initialReply ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/vendor/reviews/${reviewId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("Could not save the response.");
      return;
    }
    setMessage(initialReply ? "Response updated." : "Response published.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl bg-jade-50 p-4">
      <label className="label" htmlFor={`reply-${reviewId}`}>{initialReply ? "Edit your store response" : "Post one public store response"}</label>
      <textarea
        id={`reply-${reviewId}`}
        className="input mt-2 min-h-24 text-sm"
        minLength={2}
        maxLength={1000}
        required
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        placeholder="Thank the buyer, answer constructively, and never include private order details."
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn-primary px-4 py-2 text-xs" disabled={busy}>{busy ? "Saving…" : initialReply ? "Update response" : "Publish response"}</button>
        {message && <span className="text-xs text-ink-muted" role="status">{message}</span>}
      </div>
    </form>
  );
}

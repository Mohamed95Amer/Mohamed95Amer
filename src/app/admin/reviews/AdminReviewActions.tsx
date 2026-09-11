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

export function AdminReviewActions({ reviewId, reportId }: { reviewId: string; reportId?: string }) {
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
      setError("Moderation action failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <input className="input text-xs" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional moderation note" />
      <div className="mt-2 flex flex-wrap gap-2">
        {reportId ? (
          <>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("dismiss_report")}>Dismiss report</button>
            <button className="rounded-full bg-signal-err px-3 py-1.5 text-xs font-semibold text-white" disabled={busy !== null} onClick={() => act("action_report")}>Uphold & hide review</button>
          </>
        ) : (
          <>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("publish_review")}>Publish review</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("hide_review")}>Hide review</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("publish_reply")}>Publish reply</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => act("hide_reply")}>Hide reply</button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-signal-err">{error}</p>}
    </div>
  );
}

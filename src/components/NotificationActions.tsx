"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function NotificationActions({
  id,
  campaignId,
  unread,
  arabic = false,
}: {
  id?: string;
  campaignId?: string;
  unread?: boolean;
  arabic?: boolean;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mark() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          id ? { id } : campaignId ? { campaignId } : { all: true },
        ),
      });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      setError(
        arabic
          ? "تعذر التحديث. حاول مجدداً."
          : "Could not update. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  if ((id || campaignId) && !unread) return null;
  return (
    <div>
      <button
        type="button"
        className="min-h-11 text-xs font-semibold text-jade-700 underline underline-offset-4 disabled:opacity-50"
        disabled={busy}
        onClick={mark}
      >
        {busy
          ? arabic
            ? "جارٍ التحديث…"
            : "Updating…"
          : id || campaignId
            ? arabic
              ? "تحديد كمقروء"
              : "Mark read"
            : arabic
              ? "تحديد الكل كمقروء"
              : "Mark all read"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

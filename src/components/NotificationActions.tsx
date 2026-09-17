"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NotificationActions({ id, unread }: { id?: string; unread?: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function mark() { setBusy(true); await fetch("/api/account/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) }); setBusy(false); router.refresh(); }
  if (id && !unread) return null;
  return <button type="button" className="text-xs font-semibold text-jade-700 underline underline-offset-4" disabled={busy} onClick={mark}>{busy ? "Updating…" : id ? "Mark read" : "Mark all read"}</button>;
}


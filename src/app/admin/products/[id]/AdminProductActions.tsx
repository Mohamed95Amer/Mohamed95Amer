"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminProductActions({
  productId,
  currentStatus,
}: {
  productId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "suspend" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: "approve" | "reject" | "suspend") {
    setBusy(decision);
    setErr(null);
    const res = await fetch("/api/admin/products/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, decision, note: note || null }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 mt-3">
      <div>
        <label className="label" htmlFor="product-admin-note">Admin note</label>
        <textarea id="product-admin-note" name="admin_note" className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy !== null} onClick={() => act("approve")}>{busy === "approve" ? "…" : "Approve"}</button>
        <button className="btn-ghost" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? "…" : "Reject"}</button>
        <button className="btn-ghost" disabled={busy !== null} onClick={() => act("suspend")}>{busy === "suspend" ? "…" : "Suspend"}</button>
        <span className="self-center text-xs text-ink-muted">Current: {currentStatus}</span>
      </div>
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
    </div>
  );
}

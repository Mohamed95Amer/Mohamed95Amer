"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminProductActions({
  productId,
  currentStatus,
  arabic = false,
}: {
  productId: string;
  currentStatus: string;
  arabic?: boolean;
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
      const detail = Array.isArray(j.issues)
        ? j.issues.map((issue: { message?: unknown }) => String(issue.message ?? "Check listing data")).join(" ")
        : "";
      setErr(arabic ? j.error === "listing_integrity_failed" ? `تعذر الاعتماد: ${detail}` : "تعذر تحديث المنتج. حاول مجدداً." : j.error === "listing_integrity_failed" ? `Approval blocked: ${detail}` : typeof j.error === "string" ? j.error : "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 mt-3">
      <div>
        <label className="label" htmlFor="product-admin-note">{arabic ? "ملاحظة إدارية" : "Admin note"}</label>
        <textarea id="product-admin-note" name="admin_note" className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy !== null} onClick={() => act("approve")}>{busy === "approve" ? "…" : arabic ? "اعتماد" : "Approve"}</button>
        <button className="btn-ghost" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? "…" : arabic ? "رفض" : "Reject"}</button>
        <button className="btn-ghost" disabled={busy !== null} onClick={() => act("suspend")}>{busy === "suspend" ? "…" : arabic ? "إيقاف" : "Suspend"}</button>
        <span className="self-center text-xs text-ink-muted">{arabic ? "الحالة الحالية:" : "Current:"} {arabic ? ({ pending_approval: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض", suspended: "موقوف", draft: "مسودة" } as Record<string,string>)[currentStatus] ?? currentStatus : currentStatus}</span>
      </div>
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
    </div>
  );
}

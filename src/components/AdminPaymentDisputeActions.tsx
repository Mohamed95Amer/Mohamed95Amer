"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DisputeAction = "report" | "resolve" | "clear";

export function AdminPaymentDisputeActions({ reservationId, status, arabic = false }: { reservationId: string; status: string; arabic?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: DisputeAction) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/orders/payment-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, action, note: note || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(arabic ? "تعذر تحديث النزاع. حاول مجدداً." : body.error ?? "Could not update the payment dispute.");
        return;
      }
      setEditing(false);
      setNote("");
      router.refresh();
    } catch {
      setError(arabic ? "فشل الاتصال. حاول مجدداً." : "Connection failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-2">
        {status !== "reported" && <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setEditing(true)}>{arabic ? "الإبلاغ عن نزاع دفع" : "Flag payment dispute"}</button>}
        {status === "reported" && <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => setEditing(true)}>{arabic ? "حل النزاع" : "Resolve dispute"}</button>}
        {status !== "none" && <button type="button" className="btn-secondary px-3 py-2 text-xs" disabled={busy} onClick={() => submit("clear")}>{arabic ? "إزالة العلامة" : "Clear marker"}</button>}
        {error && <p className="w-full text-xs text-signal-err">{error}</p>}
      </div>
    );
  }

  const action: DisputeAction = status === "reported" ? "resolve" : "report";
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label">{action === "report" ? arabic ? "سبب النزاع" : "Reason for dispute" : arabic ? "ملاحظة الحل" : "Resolution note"}</span>
        <textarea className="input mt-1 min-h-24" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={action === "report" ? arabic ? "مثلاً: لم يجد المتجر مرجع التحويل." : "For example: vendor cannot match the transaction reference." : arabic ? "سجّل كيفية حل المشكلة." : "Record how the issue was resolved."} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-primary px-3 py-2 text-xs" disabled={busy} onClick={() => submit(action)}>{busy ? arabic ? "جارٍ الحفظ…" : "Saving…" : action === "report" ? arabic ? "تسجيل النزاع" : "Flag dispute" : arabic ? "تحديد كمحلول" : "Mark resolved"}</button>
        <button type="button" className="btn-secondary px-3 py-2 text-xs" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>{arabic ? "إلغاء" : "Cancel"}</button>
      </div>
      {error && <p className="text-xs text-signal-err">{error}</p>}
    </div>
  );
}

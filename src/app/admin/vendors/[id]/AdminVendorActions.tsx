"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { localizedStatusLabel } from "@/lib/localized-status";

export function AdminVendorActions({
  vendorId,
  currentStatus,
  arabic = false,
}: {
  vendorId: string;
  currentStatus: string;
  arabic?: boolean;
}) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "suspend" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: "approve" | "reject" | "suspend") {
    setBusy(decision);
    setErr(null);
    const res = await fetch("/api/admin/vendors/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId, decision, note: note || null }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : t("Failed", "تعذر تنفيذ الإجراء"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="vendor-admin-note">{t("Admin note (optional)", "ملاحظة إدارية (اختياري)")}</label>
        <textarea id="vendor-admin-note" name="admin_note" className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy !== null} onClick={() => act("approve")}>
          {busy === "approve" ? "…" : t("Approve", "اعتماد")}
        </button>
        <button className="btn-ghost" disabled={busy !== null} onClick={() => act("reject")}>
          {busy === "reject" ? "…" : t("Reject", "رفض")}
        </button>
        <button className="btn-ghost" disabled={busy !== null} onClick={() => act("suspend")}>
          {busy === "suspend" ? "…" : t("Suspend", "إيقاف")}
        </button>
        <span className="self-center text-xs text-ink-muted">{t("Current", "الحالة الحالية")}: {localizedStatusLabel(currentStatus, arabic)}</span>
      </div>
      {err && <p role="alert" className="text-sm text-signal-err">{err}</p>}
    </div>
  );
}

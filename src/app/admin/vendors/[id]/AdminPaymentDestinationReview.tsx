"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function maskedMobile(value: string) {
  return value.length >= 10 ? `${value.slice(0, 7)}•••${value.slice(-3)}` : "Not set";
}

function maskedIban(value: string) {
  return /^AE\d{21}$/.test(value) ? `${value.slice(0, 6)} •••• •••• •••• ${value.slice(-4)}` : "Not set";
}

type Settings = {
  aani_enabled: boolean;
  aani_mobile: string;
  bank_transfer_enabled: boolean;
  bank_name: string;
  beneficiary_name: string;
  iban: string;
  destination_verification_status: string;
  destination_submitted_at: string | null;
  destination_verified_at: string | null;
  destination_review_note: string | null;
};

export function AdminPaymentDestinationReview({ vendorId, settings, arabic }: { vendorId: string; settings: Settings | null; arabic: boolean }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState(settings?.destination_review_note ?? "");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const t = (en: string, ar: string) => arabic ? ar : en;

  if (!settings || (!settings.aani_enabled && !settings.bank_transfer_enabled)) {
    return <p className="mt-4 rounded-xl bg-bone-soft p-4 text-sm text-ink-muted">{t("This store has not enabled Aani or bank transfer.", "لم يفعّل هذا المتجر آني أو التحويل البنكي.")}</p>;
  }

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !note.trim()) { setError(t("Add a correction note before rejecting.", "أضف ملاحظة تصحيح قبل الرفض.")); return; }
    setBusy(decision); setError("");
    const response = await fetch("/api/admin/vendors/payment-destination", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId, decision, note: note.trim() || null }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) { setError(typeof body.error === "string" ? body.error : t("Review failed.", "تعذرت المراجعة.")); return; }
    router.refresh();
  }

  const statusTone = settings.destination_verification_status === "approved" ? "border-jade-700/20 bg-jade-50 text-jade-800" : settings.destination_verification_status === "rejected" ? "border-signal-err/20 bg-red-50 text-signal-err" : "border-gold-500/30 bg-gold-50 text-gold-800";
  return <div className="mt-4 space-y-4">
    <div className={`rounded-xl border p-4 ${statusTone}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{t("Status", "الحالة")}: {settings.destination_verification_status}</strong><button type="button" className="text-xs font-semibold underline" onClick={() => setRevealed(value => !value)}>{revealed ? t("Hide sensitive details", "إخفاء البيانات الحساسة") : t("Reveal for verification", "إظهار البيانات للتحقق")}</button></div><p className="mt-1 text-xs">{t("Compare these details with the store's licence, bank letter or official Aani evidence before approval.", "قارن هذه البيانات مع رخصة المتجر أو خطاب البنك أو إثبات آني الرسمي قبل الاعتماد.")}</p></div>
    <dl className="grid gap-3 rounded-xl border border-jade-900/10 bg-white p-4 text-sm sm:grid-cols-2">
      {settings.aani_enabled && <><div><dt className="text-xs text-ink-muted">Aani</dt><dd className="mt-1 font-semibold" dir="ltr">{revealed ? settings.aani_mobile : maskedMobile(settings.aani_mobile)}</dd></div></>}
      {settings.bank_transfer_enabled && <><div><dt className="text-xs text-ink-muted">{t("Bank", "البنك")}</dt><dd className="mt-1 font-semibold">{settings.bank_name}</dd></div><div><dt className="text-xs text-ink-muted">{t("Legal beneficiary", "المستفيد القانوني")}</dt><dd className="mt-1 font-semibold">{settings.beneficiary_name}</dd></div><div><dt className="text-xs text-ink-muted">IBAN</dt><dd className="mt-1 font-semibold" dir="ltr">{revealed ? settings.iban : maskedIban(settings.iban)}</dd></div></>}
      <div><dt className="text-xs text-ink-muted">{t("Submitted", "تاريخ الإرسال")}</dt><dd className="mt-1">{settings.destination_submitted_at ? new Date(settings.destination_submitted_at).toLocaleString(arabic ? "ar-AE" : "en-AE") : "—"}</dd></div>
      <div><dt className="text-xs text-ink-muted">{t("Last reviewed", "آخر مراجعة")}</dt><dd className="mt-1">{settings.destination_verified_at ? new Date(settings.destination_verified_at).toLocaleString(arabic ? "ar-AE" : "en-AE") : "—"}</dd></div>
    </dl>
    <label className="block"><span className="label">{t("Review note (required when rejecting)", "ملاحظة المراجعة (مطلوبة عند الرفض)")}</span><textarea className="input mt-1 min-h-24" maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy !== null} onClick={() => decide("approve")}>{busy === "approve" ? "…" : t("Approve destination", "اعتماد وجهة الدفع")}</button><button className="btn-ghost" disabled={busy !== null} onClick={() => decide("reject")}>{busy === "reject" ? "…" : t("Reject and request correction", "رفض وطلب التصحيح")}</button></div>
    {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
  </div>;
}

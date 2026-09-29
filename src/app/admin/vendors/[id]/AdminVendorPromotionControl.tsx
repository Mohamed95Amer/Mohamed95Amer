"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PromotionRow { id: string; label: string; reward_reason: string; starts_at: string; ends_at: string; cancelled_at: string | null; admin_note: string | null }

export function AdminVendorPromotionControl({ vendorId, promotions, arabic = false }: { vendorId: string; promotions: PromotionRow[]; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const [durationDays, setDurationDays] = useState(14);
  const [label, setLabel] = useState(arabic ? "متجر مميز" : "Premium vendor");
  const [reason, setReason] = useState("referral_reward");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    const response = await fetch("/api/admin/vendor-promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId, durationDays, label, rewardReason: reason, adminNote: note || null }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(typeof body.error === "string" ? body.error : t("Could not activate premium placement", "تعذر تفعيل ظهور المتجر المميز"));
    setNote(""); router.refresh();
  }

  async function cancel(id: string) {
    setBusy(true); setError(null);
    const response = await fetch("/api/admin/vendor-promotions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(typeof body.error === "string" ? body.error : t("Could not cancel placement", "تعذر إلغاء الظهور المميز"));
    router.refresh();
  }

  const now = Date.now();
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="premium-label">{t("Public label", "الوسم العام")}</label><input id="premium-label" className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <div><label className="label" htmlFor="premium-days">{t("Reward duration (days)", "مدة المكافأة (بالأيام)")}</label><input id="premium-days" className="input" type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} /></div>
      <div><label className="label" htmlFor="premium-reason">{t("Reason", "السبب")}</label><select id="premium-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="referral_reward">{t("Vendor referral reward", "مكافأة إحالة متجر")}</option><option value="launch_reward">{t("Launch reward", "مكافأة الإطلاق")}</option><option value="performance_reward">{t("Performance reward", "مكافأة الأداء")}</option><option value="commercial">{t("Commercial placement", "ظهور تجاري")}</option><option value="other">{t("Other", "سبب آخر")}</option></select></div>
      <div><label className="label" htmlFor="premium-note">{t("Private admin note", "ملاحظة إدارية خاصة")}</label><input id="premium-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Why this reward was granted", "سبب منح هذه المكافأة")} /></div>
    </div>
    <button className="btn-primary" type="button" disabled={busy} onClick={create}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Grant premium placement", "منح ظهور مميز")}</button>
    {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-jade-900/10">
      <table className="min-w-[650px] w-full text-sm"><thead className="bg-bone-soft text-ink-muted"><tr><th className="px-3 py-2 text-left">{t("Placement", "الظهور")}</th><th className="px-3 py-2 text-left">{t("Reason", "السبب")}</th><th className="px-3 py-2 text-left">{t("Dates", "التواريخ")}</th><th className="px-3 py-2 text-left">{t("Status", "الحالة")}</th><th /></tr></thead><tbody>
        {promotions.map((item) => { const active = !item.cancelled_at && Date.parse(item.starts_at) <= now && Date.parse(item.ends_at) > now; const upcoming = !item.cancelled_at && Date.parse(item.starts_at) > now; return <tr key={item.id} className="border-t border-bone-deep"><td className="px-3 py-2 font-medium">{item.label}</td><td className="px-3 py-2">{arabic ? ({ referral_reward: "مكافأة إحالة متجر", launch_reward: "مكافأة الإطلاق", performance_reward: "مكافأة الأداء", commercial: "ظهور تجاري", other: "سبب آخر" } as Record<string, string>)[item.reward_reason] ?? item.reward_reason : item.reward_reason.replaceAll("_", " ")}</td><td className="px-3 py-2 text-xs">{formatDate(item.starts_at, arabic)} → {formatDate(item.ends_at, arabic)}</td><td className="px-3 py-2">{item.cancelled_at ? t("Cancelled", "ملغى") : active ? t("Active", "نشط") : upcoming ? t("Scheduled", "مجدول") : t("Ended", "منتهٍ")}</td><td className="px-3 py-2 text-right">{(active || upcoming) && <button type="button" className="text-xs font-semibold text-signal-err underline" disabled={busy} onClick={() => cancel(item.id)}>{t("Cancel", "إلغاء")}</button>}</td></tr>; })}
        {promotions.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-ink-muted">{t("No premium placement history.", "لا يوجد سجل للظهور المميز.")}</td></tr>}
      </tbody></table>
    </div>
  </div>;
}

function formatDate(value: string, arabic = false) { return new Intl.DateTimeFormat(arabic ? "ar-AE" : "en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }

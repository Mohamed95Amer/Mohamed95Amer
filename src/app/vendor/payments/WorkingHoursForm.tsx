"use client";
import { useState, type FormEvent } from "react";
export interface WorkingHourValue { day_of_week: number; is_open: boolean; opens_at: string; closes_at: string; }
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DEFAULTS: WorkingHourValue[] = DAYS.map((_, day) => ({ day_of_week: day, is_open: true, opens_at: "10:00", closes_at: "22:00" }));
export function WorkingHoursForm({ initial, arabic = false }: { initial: WorkingHourValue[]; arabic?: boolean }) {
  const [hours, setHours] = useState(initial.length === 7 ? initial.map(r => ({ ...r, opens_at: r.opens_at.slice(0, 5), closes_at: r.closes_at.slice(0, 5) })) : DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const t = (en: string, ar: string) => arabic ? ar : en;
  function update(day: number, patch: Partial<WorkingHourValue>) { setMessage(""); setHours(current => current.map(r => r.day_of_week === day ? { ...r, ...patch } : r)); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setSaved(false);
    try {
      const response = await fetch("/api/vendor/working-hours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours }) });
      const body = await response.json().catch(() => ({}));
      setSaved(response.ok);
      setMessage(response.ok ? t("Working hours saved.", "تم حفظ مواعيد العمل.") : t("Could not save hours. " + (body.error ?? ""), "تعذر الحفظ. راجع ساعات الفتح والإغلاق."));
    } catch { setMessage(t("Connection failed. Please retry.", "تعذر الاتصال. حاول مرة أخرى.")); } finally { setBusy(false); }
  }
  return <form id="working-hours" className="card scroll-mt-28 space-y-5 p-5 sm:p-6" onSubmit={save}>
    <div><p className="eyebrow text-jade-600">{t("03 · Your store schedule", "٠٣ · مواعيد متجرك")}</p><h2 className="mt-2 font-serif text-2xl">{t("When are you open?", "ما هي مواعيد العمل؟")}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("All times are UAE time (GMT+4). Requests placed while closed wait until your next opening. Customers pay only after you confirm availability and price.", "جميع الأوقات بتوقيت الإمارات (GMT+4). تنتظر الطلبات خارج الدوام موعد الفتح التالي. يدفع العميل بعد تأكيدك التوفر والسعر.")}</p></div>
    {!initial.length && <p className="rounded-xl bg-gold-50 p-3 text-xs text-gold-700">{t("These are suggested hours. Review and save your actual schedule.", "هذه مواعيد مقترحة. راجع جدول عملك الفعلي واحفظه.")}</p>}
    <div className="space-y-3">{hours.map(row => <div key={row.day_of_week} className={`rounded-xl border p-3 ${row.is_open ? "border-jade-900/10 bg-white" : "border-bone-deep bg-bone-soft"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5 accent-jade-800" type="checkbox" checked={row.is_open} onChange={e => update(row.day_of_week, { is_open: e.target.checked })} />{(arabic ? AR_DAYS : DAYS)[row.day_of_week]} <span className="text-xs font-normal text-ink-muted">{row.is_open ? t("Open", "مفتوح") : t("Closed", "مغلق")}</span></label>{row.is_open && <button type="button" className="min-h-11 text-xs font-semibold text-jade-700 underline" onClick={() => { setHours(current => current.map(r => r.is_open ? { ...r, opens_at: row.opens_at, closes_at: row.closes_at } : r)); setMessage(t("Hours copied to the other open days. Save to apply.", "نُسخت الساعات إلى أيام العمل الأخرى. احفظ لتطبيقها.")); setSaved(false); }}>{t("Copy to open days", "نسخ لأيام العمل")}</button>}</div>
      {row.is_open && <div className="mt-2 grid grid-cols-2 gap-3"><label className="min-w-0"><span className="label">{t("Opens", "يفتح")}</span><input aria-label={DAYS[row.day_of_week] + " " + t("opening time", "وقت الفتح")} className="input mt-1 min-w-0" type="time" required value={row.opens_at} onChange={e => update(row.day_of_week, { opens_at: e.target.value })} /></label><label className="min-w-0"><span className="label">{t("Closes", "يغلق")}</span><input aria-label={DAYS[row.day_of_week] + " " + t("closing time", "وقت الإغلاق")} className="input mt-1 min-w-0" type="time" required value={row.closes_at} onChange={e => update(row.day_of_week, { closes_at: e.target.value })} /></label></div>}
    </div>)}</div>
    <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Save working hours", "حفظ مواعيد العمل")}</button>{message && <p role="status" className={`text-sm ${saved ? "text-jade-700" : "text-ink-muted"}`}>{message}</p>}
  </form>;
}

"use client";

import { useState, type FormEvent } from "react";

export interface WorkingHourValue {
  day_of_week: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULTS: WorkingHourValue[] = DAYS.map((_, day) => ({ day_of_week: day, is_open: true, opens_at: "10:00", closes_at: "22:00" }));

export function WorkingHoursForm({ initial }: { initial: WorkingHourValue[] }) {
  const [hours, setHours] = useState(initial.length === 7 ? initial.map((row) => ({ ...row, opens_at: row.opens_at.slice(0, 5), closes_at: row.closes_at.slice(0, 5) })) : DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function update(day: number, patch: Partial<WorkingHourValue>) {
    setHours((current) => current.map((row) => row.day_of_week === day ? { ...row, ...patch } : row));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/vendor/working-hours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours }) });
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Working hours saved. Requests outside these hours will wait until the next opening." : body.error ?? "Could not save hours.");
    } catch { setMessage("Connection failed. Please retry."); } finally { setBusy(false); }
  }

  return <form className="card mt-6 space-y-4 p-6" onSubmit={save}>
    <div><h2 className="font-serif text-2xl">Store working hours</h2><p className="mt-1 text-sm text-ink-muted">Times use UAE time. Customers may request while closed, but your confirmation alert waits until the store opens.</p></div>
    <div className="space-y-2">{hours.map((row) => <div key={row.day_of_week} className="grid grid-cols-[7rem_1fr] items-center gap-3 rounded-xl border border-jade-900/10 p-3 sm:grid-cols-[7rem_5rem_1fr]">
      <span className="text-sm font-semibold text-jade-950">{DAYS[row.day_of_week]}</span>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.is_open} onChange={(event) => update(row.day_of_week, { is_open: event.target.checked })} />Open</label>
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1"><input aria-label={`${DAYS[row.day_of_week]} opening time`} className="input min-w-0" type="time" disabled={!row.is_open} value={row.opens_at} onChange={(event) => update(row.day_of_week, { opens_at: event.target.value })} /><span className="text-xs text-ink-muted">to</span><input aria-label={`${DAYS[row.day_of_week]} closing time`} className="input min-w-0" type="time" disabled={!row.is_open} value={row.closes_at} onChange={(event) => update(row.day_of_week, { closes_at: event.target.value })} /></div>
    </div>)}</div>
    <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save working hours"}</button><p role="status" className="text-sm">{message}</p>
  </form>;
}

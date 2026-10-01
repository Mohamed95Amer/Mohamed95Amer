"use client";

import { useState } from "react";
import type { RateLocale } from "@/lib/gold-rate/core";

const KARATS = [24, 22, 21, 18] as const;

export function RateAlertForm({ locale, defaultKarat, currentRate }: { locale: RateLocale; defaultKarat: number; currentRate: number | null }) {
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    setMessage("");
    try {
      const target = String(form.get("targetRate") ?? "").trim();
      const response = await fetch("/api/rate-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          whatsapp: String(form.get("whatsapp") ?? "").trim() || undefined,
          karat: Number(form.get("karat")),
          frequency: form.get("frequency"),
          targetRateAed: target ? Number(target) : undefined,
          consent: form.get("consent") === "on",
          locale,
          sourcePath: window.location.pathname,
          website: String(form.get("website") ?? ""),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setState("error");
        setMessage(body.error === "rate_limited"
          ? t("Too many attempts. Please try again later.", "محاولات كثيرة، يرجى المحاولة لاحقاً.")
          : t("Please check your details and try again.", "يرجى التحقق من البيانات والمحاولة مرة أخرى."));
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage(t("Connection problem. Please try again.", "مشكلة في الاتصال، يرجى المحاولة مرة أخرى."));
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-jade-900/10 bg-jade-50 p-6" role="status">
        <h2 className="font-serif text-2xl text-jade-950">{t("You're on the list ✓", "تم تسجيلك ✓")}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t("We'll send gold rate updates to your email. Every message has a one-click unsubscribe link.", "سنرسل تحديثات سعر الذهب إلى بريدك الإلكتروني، وكل رسالة تتضمن رابطاً لإلغاء الاشتراك بنقرة واحدة.")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-jade-900/10 bg-white p-6 shadow-sm">
      <h2 className="font-serif text-2xl text-jade-950">{t("Get gold rate alerts", "احصل على تنبيهات سعر الذهب")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("A short daily rate email, or one alert when the rate drops to your target. Free, unsubscribe any time.", "رسالة يومية قصيرة بالسعر، أو تنبيه واحد عندما ينخفض السعر إلى هدفك. مجاناً ويمكنك الإلغاء في أي وقت.")}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("Email", "البريد الإلكتروني")}</span>
          <input className="input mt-1" type="email" name="email" required autoComplete="email" dir="ltr" />
        </label>
        <label className="block">
          <span className="label">{t("WhatsApp (optional)", "واتساب (اختياري)")}</span>
          <input className="input mt-1" type="tel" name="whatsapp" autoComplete="tel" placeholder="+971 5x xxx xxxx" dir="ltr" pattern="[+0-9 ()-]{7,20}" />
        </label>
        <label className="block">
          <span className="label">{t("Karat", "العيار")}</span>
          <select className="input mt-1" name="karat" defaultValue={defaultKarat}>
            {KARATS.map((karat) => <option key={karat} value={karat}>{t(`${karat}K`, `عيار ${karat}`)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">{t("Alert me", "نبّهني")}</span>
          <select className="input mt-1" name="frequency" defaultValue="daily">
            <option value="daily">{t("Every day with the rate", "يومياً بالسعر")}</option>
            <option value="target">{t("Only when it reaches my target", "فقط عند وصوله إلى هدفي")}</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">{t("Target rate per gram, AED (optional)", "السعر المستهدف للغرام بالدرهم (اختياري)")}</span>
          <input className="input mt-1" type="number" name="targetRate" min="1" step="0.01" inputMode="decimal" placeholder={currentRate ? currentRate.toFixed(2) : ""} dir="ltr" />
        </label>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>{t("I agree to receive gold rate emails and occasional Get Gold offers. I can unsubscribe at any time.", "أوافق على تلقي رسائل سعر الذهب وعروض Get Gold من حين لآخر، ويمكنني إلغاء الاشتراك في أي وقت.")} <a className="underline" href="/privacy">{t("Privacy", "الخصوصية")}</a></span>
      </label>
      {message && <p className="mt-3 text-sm text-signal-err" role="alert">{message}</p>}
      <button type="submit" className="btn-primary mt-5" disabled={state === "sending"}>{state === "sending" ? t("Saving…", "جارٍ الحفظ…") : t("Send me alerts", "أرسل لي التنبيهات")}</button>
    </form>
  );
}

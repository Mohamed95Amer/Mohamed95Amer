"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Props {
  productId: string;
  name: string;
  signedIn: boolean;
  initiallyFavourite?: boolean;
  initialAlert?: { target_total_aed: number | string | null; notify_on_making_offer: boolean } | null;
  arabic?: boolean;
}
export function ProductActions({ productId, name, signedIn, initiallyFavourite = false, initialAlert, arabic = false }: Props) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [copied, setCopied] = useState(false);
  const [favourite, setFavourite] = useState(initiallyFavourite);
  const [compared, setCompared] = useState(false);
  const [showAlert, setShowAlert] = useState(Boolean(initialAlert));
  const [target, setTarget] = useState(initialAlert?.target_total_aed == null ? "" : String(initialAlert.target_total_aed));
  const [makingOffer, setMakingOffer] = useState(initialAlert?.notify_on_making_offer ?? true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCompared(readComparison().includes(productId)), [productId]);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: `${name} | Get Gold`, text: t(`See ${name} on Get Gold`, `شاهد ${name} على Get Gold`), url: window.location.href }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function toggleFavourite() {
    if (!signedIn) return;
    setBusy(true); setMessage(null);
    const next = !favourite;
    const response = await fetch("/api/account/favourites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, favourite: next }) });
    setBusy(false);
    if (!response.ok) return setMessage(t("Could not update saved items.", "تعذر تحديث العناصر المحفوظة."));
    setFavourite(next); setMessage(next ? t("Saved to your shortlist.", "تمت الإضافة إلى قائمتك.") : t("Removed from saved items.", "تمت الإزالة من المحفوظات."));
  }

  function toggleCompare() {
    const current = readComparison();
    const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId].slice(-4);
    localStorage.setItem("gg_compare", JSON.stringify(next));
    setCompared(next.includes(productId));
    window.dispatchEvent(new CustomEvent("gg-compare-change"));
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventName: "compare_added", productId }) });
  }

  async function saveAlert() {
    if (!signedIn) return;
    setBusy(true); setMessage(null);
    const response = await fetch("/api/account/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, targetTotalAed: target ? Number(target) : null, notifyOnMakingOffer: makingOffer }) });
    setBusy(false);
    if (!response.ok) return setMessage(t("Choose a target price or making-charge offer.", "حدد سعرًا مستهدفًا أو اختر تنبيهات عروض المصنعية."));
    setShowAlert(true); setMessage(t("Alert saved. We’ll notify you inside Get Gold.", "تم حفظ التنبيه. سنخطرك داخل Get Gold."));
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        <button type="button" onClick={share} className="btn-ghost px-4 text-xs"><span aria-hidden="true">↗</span>&nbsp; {copied ? t("Link copied", "تم نسخ الرابط") : t("Share", "مشاركة")}</button>
        {signedIn ? <button type="button" disabled={busy} onClick={toggleFavourite} className="btn-ghost px-4 text-xs">{favourite ? t("♥ Saved", "♥ محفوظ") : t("♡ Save", "♡ حفظ")}</button> : <Link href={`/login?next=${encodeURIComponent(`/products/${productId}`)}`} className="btn-ghost px-4 text-xs">♡ {t("Sign in to save", "سجل الدخول للحفظ")}</Link>}
        <button type="button" onClick={toggleCompare} className="btn-ghost px-4 text-xs">{compared ? t("✓ Comparing", "✓ ضمن المقارنة") : t("⇄ Compare", "⇄ قارن")}</button>
        {signedIn && <button type="button" onClick={() => setShowAlert((value) => !value)} className="btn-ghost px-4 text-xs">⌁ {t("Price alert", "تنبيه السعر")}</button>}
      </div>
      {showAlert && signedIn && (
        <div className="mt-3 grid gap-3 rounded-2xl border border-jade-900/10 bg-jade-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor={`alert-${productId}`}>{t("Notify me at total price (AED)", "نبهني عند بلوغ السعر الإجمالي (درهم)")}</label>
            <input id={`alert-${productId}`} className="input" type="number" min="1" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder={t("Optional target total", "سعر مستهدف اختياري")} />
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={makingOffer} onChange={(event) => setMakingOffer(event.target.checked)} /> {t("Also notify me when making-charge promotions appear", "أخطرني أيضًا بعروض المصنعية")}</label>
          </div>
          <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={saveAlert} disabled={busy}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Save alert", "حفظ التنبيه")}</button>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-jade-700">{message}</p>}
    </div>
  );
}

function readComparison(): string[] {
  try { const value = JSON.parse(localStorage.getItem("gg_compare") || "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}

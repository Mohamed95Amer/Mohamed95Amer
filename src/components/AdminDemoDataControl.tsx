"use client";

import { useState } from "react";

export function AdminDemoDataControl({ initialVisible, arabic = false }: { initialVisible: boolean; arabic?: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [visible, setVisible] = useState(initialVisible);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    const next = !visible;
    const response = await fetch("/api/admin/demo-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_data_visible: next }),
    });
    if (response.ok) {
      setVisible(next);
      setMessage(next ? t("Demo data is visible on the public site.", "البيانات التجريبية ظاهرة في الموقع العام.") : t("Demo data is hidden from the public site.", "البيانات التجريبية مخفية من الموقع العام."));
    } else {
      const body = await response.json().catch(() => null);
      setMessage(typeof body?.error === "string" ? body.error : t("Could not update demo-data visibility.", "تعذر تحديث ظهور البيانات التجريبية."));
    }
    setBusy(false);
  }

  return (
    <section className="card border-gold-300/60 bg-gold-50/40 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-gold-700">{t("Launch control", "التحكم بالإطلاق")}</p>
          <h2 className="mt-1 font-serif text-xl text-jade-950">{t("Demo catalogue visibility", "ظهور الكتالوج التجريبي")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            {visible ? t("Seeded demo stores and listings are currently visible to public visitors.", "المتاجر والمنتجات التجريبية ظاهرة للزوار حاليًا.") : t("Seeded demo stores, listings, orders and review are hidden from public visitors.", "المتاجر والمنتجات والطلبات والتقييمات التجريبية مخفية عن الزوار.")}
            {" "}{t("Real vendor data is not affected.", "لا تتأثر بيانات المتاجر الحقيقية.")}
          </p>
        </div>
        <button type="button" className={visible ? "btn-ghost shrink-0" : "btn-primary shrink-0"} onClick={toggle} disabled={busy}>
          {busy ? t("Saving…", "جارٍ الحفظ…") : visible ? t("Hide demo data", "إخفاء البيانات التجريبية") : t("Reveal demo data", "إظهار البيانات التجريبية")}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-xs text-ink-muted">{message}</p>}
    </section>
  );
}

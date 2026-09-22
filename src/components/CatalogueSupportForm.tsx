"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function CatalogueSupportForm({ arabic = false }: { arabic?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (en: string, ar: string) => arabic ? ar : en;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/vendor/catalogue-support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetListingCount: Number(form.get("count")), notes: form.get("notes") || null }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setError(json.error === "active_request_exists" ? t("You already have an active request.", "لديك طلب قائم بالفعل.") : t("Could not request support. Please retry.", "تعذر إرسال الطلب. حاول مرة أخرى.")); return; }
      router.refresh();
    } catch { setError(t("Connection failed. Please retry.", "تعذر الاتصال. حاول مرة أخرى.")); } finally { setBusy(false); }
  }
  return <form className="card grid gap-5 p-5 sm:p-6" onSubmit={submit}><h2 className="font-serif text-2xl">{t("Tell us what you need", "أخبرنا بما تحتاجه")}</h2><label><span className="label">{t("How many products?", "كم عدد المنتجات؟")}</span><select name="count" className="input mt-1" defaultValue="15">{[10, 15, 20].map(count => <option key={count} value={count}>{count} {t("products", "منتجاً")}</option>)}</select></label><label><span className="label">{t("What help do you need?", "ما المساعدة التي تحتاجها؟")}</span><textarea name="notes" className="input mt-1 min-h-28" maxLength={1000} placeholder={t("Photos, product entry, certificates, or preparing an existing catalogue.", "الصور، إضافة المنتجات، الشهادات، أو تجهيز كتالوج موجود.")} /></label>{error && <p role="alert" className="text-sm text-signal-err">{error}</p>}<button className="btn-primary" disabled={busy}>{busy ? t("Sending…", "جارٍ الإرسال…") : t("Request free catalogue help", "طلب مساعدة مجانية للكتالوج")}</button></form>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { vendorDate } from "@/lib/vendor-workspace";
const DOC_TYPES = [["trade_license", "Trade licence", "الرخصة التجارية"], ["emirates_id", "Emirates ID", "الهوية الإماراتية"], ["passport", "Passport", "جواز السفر"], ["vat_certificate", "VAT certificate", "شهادة الضريبة"], ["store_photo", "Store photo", "صورة المتجر"], ["authorization_letter", "Authorization letter", "خطاب التفويض"]] as const;
interface Doc { id: string; doc_type: string; original_filename: string | null; mime_type: string | null; size_bytes: number | null; storage_path: string; uploaded_at: string; }
export function VendorDocumentsClient({ vendorId, initialDocs, arabic = false }: { vendorId: string; initialDocs: Doc[]; arabic?: boolean }) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [docType, setDocType] = useState<string>("trade_license");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const t = (en: string, ar: string) => arabic ? ar : en;
  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setErr(null); setMessage(null);
    if (file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) { setErr(t("Choose a PDF, JPG or PNG of up to 10 MB.", "اختر PDF أو JPG أو PNG بحجم لا يتجاوز ١٠ ميغابايت.")); input.value = ""; return; }
    setBusy(true);
    try {
      const path = `${vendorId}/${docType}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await getBrowserSupabase().storage.from("vendor-docs").upload(path, file, { upsert: false, cacheControl: "3600" });
      if (error) throw error;
      const res = await fetch("/api/vendor/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendor_id: vendorId, doc_type: docType, storage_path: path, original_filename: file.name, mime_type: file.type, size_bytes: file.size }) });
      if (!res.ok) throw new Error("Could not record document");
      const result = await res.json(); setDocs(current => [result.doc, ...current]);
      setMessage(t("Document uploaded privately.", "تم رفع المستند بشكل خاص.")); router.refresh();
    } catch { setErr(t("Could not finish the upload. Please retry.", "تعذر إكمال الرفع. حاول مرة أخرى.")); } finally { setBusy(false); input.value = ""; }
  }
  async function viewDoc(path: string) {
    setViewing(path); setErr(null);
    // Open synchronously so mobile browsers do not block the private document tab.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const res = await fetch("/api/vendor/documents/signed-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
      if (!res.ok) throw new Error("Unavailable");
      const body = await res.json();
      if (tab) tab.location.href = body.url;
      else { setErr(t("Allow this site's pop-up to open your document.", "اسمح بالنافذة المنبثقة لهذا الموقع لفتح المستند.")); }
    } catch { tab?.close(); setErr(t("Could not open this document. Please retry.", "تعذر فتح المستند. حاول مرة أخرى.")); } finally { setViewing(null); }
  }
  return <div className="grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]"><section className="card space-y-4 p-5 sm:p-6"><h2 className="font-serif text-2xl">{t("Add a document", "إضافة مستند")}</h2><label className="block"><span className="label">{t("Document type", "نوع المستند")}</span><select disabled={busy} className="input mt-1" value={docType} onChange={e => setDocType(e.target.value)}>{DOC_TYPES.map(([value, en, ar]) => <option key={value} value={value}>{arabic ? ar : en}</option>)}</select></label><label className="block rounded-xl border border-dashed border-jade-900/25 bg-bone-soft p-4"><span className="label">{busy ? t("Uploading…", "جارٍ الرفع…") : t("Choose document", "اختيار المستند")}</span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={onUpload} className="mt-3 block w-full min-w-0 text-sm" /><span className="mt-3 block text-xs text-ink-muted">PDF, JPG, PNG · {t("10 MB maximum", "١٠ ميغابايت كحد أقصى")}</span></label>{err && <p role="alert" className="text-sm text-signal-err">{err}</p>}{message && <p role="status" className="text-sm text-jade-700">{message}</p>}</section>
    <section className="card p-5 sm:p-6"><h2 className="font-serif text-2xl">{t("Your private documents", "مستنداتك الخاصة")} <span className="text-sm text-ink-muted">({docs.length})</span></h2><ul className="mt-4 divide-y divide-jade-900/10">{docs.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{d.original_filename ?? t("Document", "مستند")}</p><p className="mt-1 text-xs text-ink-muted">{DOC_TYPES.find(type => type[0] === d.doc_type)?.[arabic ? 2 : 1]} · {vendorDate(d.uploaded_at, arabic)} · {Math.round((d.size_bytes ?? 0) / 1024)} KB</p></div><button type="button" className="btn-ghost min-h-11 text-xs" disabled={viewing !== null} onClick={() => viewDoc(d.storage_path)}>{viewing === d.storage_path ? t("Opening…", "جارٍ الفتح…") : t("View", "عرض")}</button></li>)}{!docs.length && <li className="py-8 text-sm leading-relaxed text-ink-muted">{t("No documents uploaded yet. Add your trade licence first; you can add the other documents later.", "لم تُرفع مستندات بعد. ابدأ بالرخصة التجارية، ويمكنك إضافة المستندات الأخرى لاحقاً.")}</li>}</ul></section></div>;
}

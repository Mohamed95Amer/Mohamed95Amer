"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Issue {
  line: number | null;
  column: string | null;
  message: string;
}

interface CheckResult {
  ok: boolean;
  committed: boolean;
  row_count: number;
  issues: Issue[];
  preview?: Array<Record<string, unknown>>;
  status?: string;
}

/** Mirrors BULK_MAX_BYTES on the server; checked here only to fail fast. */
const MAX_BYTES = 1_000_000;


export function BulkUploadClient({ maxRows, arabic = false }: { maxRows: number; arabic?: boolean }) {
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const errorText: Record<string, string> = {
    unauthorized: t("Your session has expired. Sign in again.", "انتهت صلاحية الجلسة. سجّل الدخول من جديد."),
    no_vendor: t("Your vendor account could not be found.", "لم يتم العثور على حساب متجرك."),
    rate_limited: t(
      "Too many bulk uploads in the last hour. Try again later.",
      "عدد كبير من عمليات الرفع خلال الساعة الماضية. حاول لاحقًا.",
    ),
    invalid_json: t("The upload could not be read. Try again.", "تعذّر قراءة الملف المرفوع. حاول مرة أخرى."),
    invalid_input: t("The file is too large or empty.", "الملف كبير جدًا أو فارغ."),
    insert_failed: t(
      "The products could not be created. Nothing was saved.",
      "تعذّر إنشاء المنتجات. لم يتم حفظ أي شيء.",
    ),
  };
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "commit" | null>(null);
  const [done, setDone] = useState<{ count: number; status: string } | null>(null);

  function reset() {
    setCsv(null);
    setFileName(null);
    setResult(null);
    setError(null);
    setDone(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onPick(file: File | undefined) {
    setResult(null);
    setError(null);
    setDone(null);
    if (!file) {
      setCsv(null);
      setFileName(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setCsv(null);
      setFileName(file.name);
      setError(t(`That file is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is 1 MB.`, `حجم الملف ${(file.size / 1_000_000).toFixed(1)} ميجابايت. الحد الأقصى 1 ميجابايت.`));
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    await send(text, false);
  }

  async function send(text: string, commit: boolean) {
    setBusy(commit ? "commit" : "check");
    setError(null);
    try {
      const res = await fetch("/api/vendor/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, commit }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = typeof body.error === "string" ? body.error : "";
        setError(errorText[key] ?? (typeof body.message === "string" ? body.message : t("The upload failed.", "فشل الرفع.")));
        return;
      }
      if (body.committed) {
        setDone({ count: body.row_count, status: body.status ?? "draft" });
        setResult(null);
        router.refresh();
        return;
      }
      setResult(body as CheckResult);
    } catch {
      setError(t("The upload could not be sent. Check your connection and try again.", "تعذّر إرسال الملف. تحقق من الاتصال وحاول مرة أخرى."));
    } finally {
      setBusy(null);
    }
  }

  // --- after a successful import --------------------------------------------
  if (done) {
    return (
      <div className="card mt-8 p-6">
        <h2 className="font-serif text-xl">
          {t(`${done.count} ${done.count === 1 ? "product" : "products"} created`, `تم إنشاء ${done.count} منتج`)}
        </h2>
        <p className="text-sm text-ink-muted mt-1">
          {t(
            "They were saved as drafts. Open each one to add photos and a description, then submit it for approval.",
            "تم حفظها كمسودات. افتح كل منتج لإضافة الصور والوصف ثم أرسله للمراجعة.",
          )}
        </p>
        <div className="mt-4 flex gap-3">
          <button type="button" className="btn-primary" onClick={() => router.push("/vendor/products")}>
            {t("View my products", "عرض منتجاتي")}
          </button>
          <button type="button" className="btn-ghost" onClick={reset}>
            {t("Upload another file", "رفع ملف آخر")}
          </button>
        </div>
      </div>
    );
  }

  const issues = result?.issues ?? [];
  const readyCount = result?.ok ? result.row_count : 0;

  return (
    <div className="card mt-8 p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grow">
          <label className="label" htmlFor="bulk-file">{t("CSV file", "ملف CSV")}</label>
          <input
            id="bulk-file"
            ref={fileInput}
            className="input"
            type="file"
            accept=".csv,text/csv"
            disabled={busy !== null}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <p className="text-xs text-ink-muted mt-1">
            {t(
              `One row per product, up to ${maxRows} rows. Checked before anything is created.`,
              `صف واحد لكل منتج، حتى ${maxRows} صفًا. يتم التحقق قبل إنشاء أي منتج.`,
            )}
          </p>
        </div>
        <a className="btn-ghost" href="/api/vendor/products/bulk" download>
          {t("Download template", "تنزيل القالب")}
        </a>
      </div>

      {busy === "check" && <p className="text-sm text-ink-muted mt-4">{t(`Checking ${fileName}…`, `جارٍ التحقق من ${fileName}…`)}</p>}

      {error && (
        <div className="mt-4 rounded-md border border-signal-err/30 bg-signal-err/5 p-4">
          <p className="text-sm text-signal-err">{error}</p>
        </div>
      )}

      {/* --- problems found ---------------------------------------------- */}
      {issues.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium text-signal-err">
            {t(
              `${issues.length === 1 ? "1 problem" : `${issues.length} problems`} found — nothing was created`,
              `تم العثور على ${issues.length} مشكلة — لم يتم إنشاء أي منتج`,
            )}
          </h3>
          <p className="text-sm text-ink-muted mt-1">
            {t(
              "Fix these rows in your spreadsheet, save it again, and upload it once more. Row numbers match the rows in your file.",
              "صحّح هذه الصفوف في جدول البيانات، واحفظه مرة أخرى، ثم ارفعه من جديد. أرقام الصفوف مطابقة لصفوف ملفك.",
            )}
          </p>
          <div className="card mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-ink-muted">
                <tr>
                  <th className="px-4 py-2 text-start w-20">{t("Row", "الصف")}</th>
                  <th className="px-4 py-2 text-start w-40">{t("Column", "العمود")}</th>
                  <th className="px-4 py-2 text-start">{t("Problem", "المشكلة")}</th>
                </tr>
              </thead>
              <tbody>
                {issues.slice(0, 100).map((issue, i) => (
                  <tr key={i} className="border-t border-bone-deep align-top">
                    <td className="px-4 py-2">{issue.line ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{issue.column ?? "—"}</td>
                    <td className="px-4 py-2">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {issues.length > 100 && (
            <p className="text-sm text-ink-muted mt-2">
              {t(
                `Showing the first 100 of ${issues.length}. Fix these and upload again to see the rest.`,
                `يتم عرض أول 100 من ${issues.length}. صحّحها وارفع الملف مرة أخرى لرؤية الباقي.`,
              )}
            </p>
          )}
        </div>
      )}

      {/* --- file is good, confirm --------------------------------------- */}
      {result?.ok && !result.committed && (
        <div className="mt-6">
          <h3 className="font-medium text-signal-ok">
            {t(
              `${readyCount} ${readyCount === 1 ? "product is" : "products are"} ready to create`,
              `${readyCount} منتج جاهز للإنشاء`,
            )}
          </h3>
          <p className="text-sm text-ink-muted mt-1">
            {t(
              "No products have been created yet. Check the first few rows below, then confirm.",
              "لم يتم إنشاء أي منتج بعد. راجع الصفوف الأولى أدناه ثم أكّد.",
            )}
          </p>

          {result.preview && result.preview.length > 0 && (
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 text-start">{t("Row", "الصف")}</th>
                    <th className="px-4 py-2 text-start">{t("Name", "الاسم")}</th>
                    <th className="px-4 py-2 text-start">{t("Category", "الفئة")}</th>
                    <th className="px-4 py-2 text-end">{t("Karat", "العيار")}</th>
                    <th className="px-4 py-2 text-end">{t("Weight (g)", "الوزن (غ)")}</th>
                    <th className="px-4 py-2 text-end">{t("Qty", "الكمية")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((p, i) => (
                    <tr key={i} className="border-t border-bone-deep">
                      <td className="px-4 py-2">{String(p.line)}</td>
                      <td className="px-4 py-2 font-medium">{String(p.name)}</td>
                      <td className="px-4 py-2">{String(p.category)}</td>
                      <td className="px-4 py-2 text-right">{String(p.karat)}K</td>
                      <td className="px-4 py-2 text-right">{String(p.weight_grams)}</td>
                      <td className="px-4 py-2 text-right">{String(p.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.preview && readyCount > result.preview.length && (
            <p className="text-sm text-ink-muted mt-2">
              {t(`Showing ${result.preview.length} of ${readyCount} rows.`, `يتم عرض ${result.preview.length} من ${readyCount} صفًا.`)}
            </p>
          )}

          <p className="mt-4 rounded-md border border-bone-deep bg-bone-soft p-3 text-sm text-ink-muted">
            {t(
              "These are created as drafts. A product needs at least one photograph and a description before it can be submitted for approval, so open each one to finish it and submit it there.",
              "تُنشأ هذه المنتجات كمسودات. يحتاج المنتج إلى صورة واحدة على الأقل ووصف قبل إرساله للمراجعة، لذا افتح كل منتج لإكماله وإرساله من هناك.",
            )}
          </p>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== null || csv === null}
              onClick={() => csv && send(csv, true)}
            >
              {busy === "commit"
                ? t("Creating…", "جارٍ الإنشاء…")
                : t(
                    `Create ${readyCount} ${readyCount === 1 ? "product" : "products"}`,
                    `أنشئ ${readyCount} منتج`,
                  )}
            </button>
            <button type="button" className="btn-ghost" disabled={busy !== null} onClick={reset}>
              {t("Choose a different file", "اختر ملفًا آخر")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

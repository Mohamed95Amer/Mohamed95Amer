import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { BULK_COLUMNS, BULK_MAX_ROWS } from "@/lib/products/bulk";
import { BulkUploadClient } from "./BulkUploadClient";

export const dynamic = "force-dynamic";

export default async function BulkUploadPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load your store.");
  if (!vendor) redirect("/vendor/register");

  const steps = [
    {
      n: 1,
      t: t("Download the template", "نزّل القالب"),
      d: t("It already has the right column headings.", "يحتوي على عناوين الأعمدة الصحيحة."),
    },
    {
      n: 2,
      t: t("Fill in one row per product", "املأ صفًا لكل منتج"),
      d: t(
        "Save it as CSV from Excel, Numbers or Google Sheets.",
        "احفظه بصيغة CSV من Excel أو Numbers أو Google Sheets.",
      ),
    },
    {
      n: 3,
      t: t("Upload and check", "ارفع الملف وتحقق منه"),
      d: t(
        "You will see any problems, with the row number, before anything is created.",
        "ستظهر لك أي مشكلات مع رقم الصف قبل إنشاء أي منتج.",
      ),
    },
  ];

  return (
    <div className="container-pro py-8 sm:py-10" dir={ar ? "rtl" : "ltr"}>
      <nav className="text-sm text-ink-muted">
        <Link href="/vendor/products" className="underline">
          {t("My products", "منتجاتي")}
        </Link>
        <span className="mx-2">/</span>
        <span>{t("Bulk upload", "رفع دفعة")}</span>
      </nav>

      <p className="eyebrow mt-2 text-jade-600">{t("Your catalogue", "كتالوج متجرك")}</p>
      <h1 className="mt-2 font-serif text-3xl sm:text-4xl">
        {t("Bulk upload products", "رفع المنتجات بشكل جماعي")}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {t(
          `Add up to ${BULK_MAX_ROWS} products at once from a spreadsheet. Nothing is created until you check the file and confirm. Products arrive as drafts — add photos and a description to each one, then submit it for approval.`,
          `أضف حتى ${BULK_MAX_ROWS} منتجًا في مرة واحدة من جدول بيانات. لا يتم إنشاء أي منتج قبل أن تتحقق من الملف وتؤكد. تُضاف المنتجات كمسودات — أضف الصور والوصف لكل منتج ثم أرسله للمراجعة.`,
        )}
      </p>

      <VendorNav arabic={ar} />

      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="card p-4">
            <span className="pill border-gold-300/60 bg-gold-50 text-gold-600">
              {t(`Step ${s.n}`, `الخطوة ${s.n}`)}
            </span>
            <p className="mt-2 font-medium">{s.t}</p>
            <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
          </li>
        ))}
      </ol>

      <BulkUploadClient maxRows={BULK_MAX_ROWS} arabic={ar} />

      <section className="mt-10">
        <h2 className="font-serif text-xl">{t("Columns", "الأعمدة")}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t(
            "Only the four required columns have to be filled in. Headings are matched loosely, so “Weight (grams)” and “weight_grams” both work.",
            "الأعمدة المطلوبة الأربعة فقط إلزامية. تتم مطابقة العناوين بمرونة، لذا يعمل كل من «Weight (grams)» و«weight_grams».",
          )}
        </p>
        <div className="card mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bone-soft text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-start">{t("Column", "العمود")}</th>
                <th className="px-4 py-2 text-start">{t("Required", "مطلوب")}</th>
                <th className="px-4 py-2 text-start">{t("Accepted values", "القيم المقبولة")}</th>
              </tr>
            </thead>
            <tbody>
              {BULK_COLUMNS.map((c) => (
                <tr key={c.key} className="border-t border-bone-deep align-top">
                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">{c.key}</td>
                  <td className="px-4 py-2">
                    {c.required ? (
                      <span className="pill border-bone-deep bg-bone-soft">
                        {t("required", "مطلوب")}
                      </span>
                    ) : (
                      <span className="text-ink-muted">{t("optional", "اختياري")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-ink-muted" dir="ltr">{c.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          {t(
            "Photos are not part of the file. A product needs at least one photograph and a description of 20 characters or more before it can be submitted for approval, so open each product after the upload to finish it.",
            "الصور ليست جزءًا من الملف. يحتاج المنتج إلى صورة واحدة على الأقل ووصف من 20 حرفًا أو أكثر قبل إرساله للمراجعة، لذا افتح كل منتج بعد الرفع لإكماله.",
          )}
        </p>
      </section>
    </div>
  );
}

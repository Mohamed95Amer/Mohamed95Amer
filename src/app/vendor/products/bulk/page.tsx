import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { BULK_COLUMNS, BULK_MAX_ROWS } from "@/lib/products/bulk";
import { BulkUploadClient } from "./BulkUploadClient";

export const dynamic = "force-dynamic";

export default async function BulkUploadPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, verification_status")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  return (
    <div className="container-pro py-10 max-w-4xl">
      <nav className="text-sm text-ink-muted">
        <Link href="/vendor/products" className="underline">My products</Link>
        <span className="mx-2">/</span>
        <span>Bulk upload</span>
      </nav>

      <h1 className="font-serif text-3xl mt-2">Bulk upload products</h1>
      <p className="text-sm text-ink-muted mt-1">
        Add up to {BULK_MAX_ROWS} products at once from a spreadsheet. Nothing is created until you
        check the file and confirm.
      </p>

      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { n: 1, t: "Download the template", d: "It already has the right column headings." },
          { n: 2, t: "Fill in one row per product", d: "Save it as CSV from Excel, Numbers or Sheets." },
          { n: 3, t: "Upload and check", d: "You will see any problems, with the row number, before anything is created." },
        ].map((s) => (
          <li key={s.n} className="card p-4">
            <span className="pill border-gold-200 bg-gold-50 text-gold-600">Step {s.n}</span>
            <p className="mt-2 font-medium">{s.t}</p>
            <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
          </li>
        ))}
      </ol>

      <BulkUploadClient
        vendorApproved={vendor.verification_status === "approved"}
        maxRows={BULK_MAX_ROWS}
      />

      <section className="mt-10">
        <h2 className="font-serif text-xl">Columns</h2>
        <p className="text-sm text-ink-muted mt-1">
          Only the four required columns have to be filled in. Headings are matched loosely, so
          &ldquo;Weight (grams)&rdquo; and &ldquo;weight_grams&rdquo; both work.
        </p>
        <div className="card mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bone-soft text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Column</th>
                <th className="px-4 py-2 text-left">Required</th>
                <th className="px-4 py-2 text-left">Accepted values</th>
              </tr>
            </thead>
            <tbody>
              {BULK_COLUMNS.map((c) => (
                <tr key={c.key} className="border-t border-bone-deep align-top">
                  <td className="px-4 py-2 font-mono text-xs">{c.key}</td>
                  <td className="px-4 py-2">
                    {c.required
                      ? <span className="pill border-bone-deep bg-bone-soft">required</span>
                      : <span className="text-ink-muted">optional</span>}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{c.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-muted mt-4">
          Photos are not part of the file. Add them by opening each product after the upload.
        </p>
      </section>
    </div>
  );
}

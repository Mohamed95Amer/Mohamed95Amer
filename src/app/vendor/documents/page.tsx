import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorDocumentsClient } from "./VendorDocumentsClient";
import { VendorNav } from "@/components/VendorNav";
export const dynamic = "force-dynamic";
export default async function VendorDocumentsPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin.from("vendors").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load your store.");
  if (!vendor) redirect("/vendor/register");
  const { data: docs, error: docsError } = await admin.from("vendor_documents").select("id, doc_type, original_filename, mime_type, size_bytes, storage_path, uploaded_at").eq("vendor_id", vendor.id).order("uploaded_at", { ascending: false });
  if (docsError) throw new Error("Could not load documents.");
  return <div className="container-pro py-8 sm:py-10" dir={ar ? "rtl" : "ltr"}><p className="eyebrow text-jade-600">{ar ? "ملفات النشاط" : "Business records"}</p><h1 className="mt-2 font-serif text-3xl sm:text-4xl">{ar ? "مستندات التحقق" : "Verification documents"}</h1><p className="mt-2 text-sm text-ink-muted">{ar ? "مستنداتك خاصة. يمكنك أنت وفريق Get Gold المختص فقط الاطلاع عليها." : "Your documents are private, accessible only to you and the Get Gold compliance team."}</p><VendorNav arabic={ar} /><VendorDocumentsClient vendorId={vendor.id} initialDocs={docs ?? []} arabic={ar} /></div>;
}

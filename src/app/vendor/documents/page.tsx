import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorDocumentsClient } from "./VendorDocumentsClient";
import { VendorNav } from "@/components/VendorNav";

export const dynamic = "force-dynamic";

export default async function VendorDocumentsPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const { data: docs } = await admin
    .from("vendor_documents")
    .select("id, doc_type, original_filename, mime_type, size_bytes, storage_path, uploaded_at")
    .eq("vendor_id", vendor.id)
    .order("uploaded_at", { ascending: false });

  return (
    <div className="container-pro py-10 max-w-3xl">
      <h1 className="font-serif text-3xl">Verification documents</h1>
      <p className="text-sm text-ink-muted mt-1">
        Documents are stored privately. Only you and our compliance team can access them, via signed URLs.
      </p>
      <VendorNav />
      <div className="card mt-6 p-6">
        <VendorDocumentsClient vendorId={vendor.id} initialDocs={docs ?? []} />
      </div>
    </div>
  );
}

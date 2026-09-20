import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = [
  "application_id", "created_at", "status", "official_store_name", "first_name", "last_name", "title",
  "email", "phone", "trade_license_number", "license_expiry_date", "number_of_stores", "emirate",
  "store_address", "map_link", "vat_trn_number", "delivery_available", "online_payment_available",
  "website_available", "website_url", "document_count", "document_types", "document_filenames", "admin_notes",
] as const;

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  await requireAdmin();
  const status = new URL(request.url).searchParams.get("status");
  const admin = getServiceSupabase();
  let vendorsQuery = admin.from("vendors").select("id, created_at, verification_status, business_name, owner_name, contact_first_name, contact_last_name, contact_title, email, phone, trade_license_number, license_expiry_date, number_of_stores, emirate, store_address, google_maps_link, vat_trn_number, delivery_available, online_payment_available, website_available, website_url, admin_notes").order("created_at", { ascending: false });
  if (status && ["pending", "approved", "rejected", "suspended"].includes(status)) vendorsQuery = vendorsQuery.eq("verification_status", status);
  const [{ data: vendors, error: vendorsError }, { data: documents, error: documentsError }] = await Promise.all([
    vendorsQuery,
    admin.from("vendor_documents").select("vendor_id, doc_type, original_filename").order("uploaded_at", { ascending: true }),
  ]);
  if (vendorsError || documentsError) return NextResponse.json({ error: "Could not prepare the vendor export" }, { status: 500 });

  const docsByVendor = new Map<string, { types: string[]; filenames: string[] }>();
  for (const document of documents ?? []) {
    const existing = docsByVendor.get(document.vendor_id) ?? { types: [], filenames: [] };
    existing.types.push(document.doc_type);
    if (document.original_filename) existing.filenames.push(document.original_filename);
    docsByVendor.set(document.vendor_id, existing);
  }

  const rows = (vendors ?? []).map((vendor) => {
    const docs = docsByVendor.get(vendor.id) ?? { types: [], filenames: [] };
    return [
      vendor.id,
      vendor.created_at,
      vendor.verification_status,
      vendor.business_name,
      vendor.contact_first_name ?? (vendor.owner_name ?? "").split(/\s+/)[0] ?? "",
      vendor.contact_last_name ?? (vendor.owner_name ?? "").split(/\s+/).slice(1).join(" "),
      vendor.contact_title,
      vendor.email,
      vendor.phone,
      vendor.trade_license_number,
      vendor.license_expiry_date,
      vendor.number_of_stores ?? 1,
      vendor.emirate,
      vendor.store_address,
      vendor.google_maps_link,
      vendor.vat_trn_number,
      vendor.delivery_available ? "Yes" : "No",
      vendor.online_payment_available ? "Yes" : "No",
      vendor.website_available ? "Yes" : "No",
      vendor.website_url,
      docs.types.length,
      docs.types,
      docs.filenames,
      vendor.admin_notes,
    ];
  });
  const csv = `\uFEFF${columns.join(",")}\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const suffix = status && ["pending", "approved", "rejected", "suspended"].includes(status) ? `-${status}` : "";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="get-gold-vendor-applications${suffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

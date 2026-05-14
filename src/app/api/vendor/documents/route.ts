import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  vendor_id: z.string().uuid(),
  doc_type: z.enum(["trade_license","emirates_id","passport","vat_certificate","store_photo","authorization_letter"]),
  storage_path: z.string().min(3).max(500),
  original_filename: z.string().max(255).optional().nullable(),
  mime_type: z.string().max(120).optional().nullable(),
  size_bytes: z.number().int().min(0).max(50 * 1024 * 1024).optional().nullable(),
});

export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("id", parsed.data.vendor_id)
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (!vendor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Sanity check: the storage path must start with `<vendor_id>/`
  if (!parsed.data.storage_path.startsWith(`${vendor.id}/`)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("vendor_documents")
    .insert(parsed.data)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: "vendor_document.uploaded",
    entity_type: "vendor_document",
    entity_id: data.id,
    new_value: { doc_type: data.doc_type, path: data.storage_path },
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ doc: data });
}

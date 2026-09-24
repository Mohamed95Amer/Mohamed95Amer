import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { catalogueSupportRequestSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = catalogueSupportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).maybeSingle();
  if (!vendor) return NextResponse.json({ error: "vendor_required" }, { status: 403 });
  const { data, error } = await admin.from("catalogue_support_requests").insert({
    vendor_id: vendor.id,
    requested_by: auth.user.id,
    target_listing_count: parsed.data.targetListingCount,
    notes: parsed.data.notes || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.code === "23505" ? "active_request_exists" : error?.message ?? "request_failed" }, { status: error?.code === "23505" ? 409 : 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "catalogue_support.requested", entity_type: "catalogue_support_request", entity_id: data.id, ip_address: ipFromRequest(request) });
  return NextResponse.json({ id: data.id });
}

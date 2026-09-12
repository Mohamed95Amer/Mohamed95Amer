import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { storeVisitResponseSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = storeVisitResponseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).maybeSingle();
  if (!vendor) return NextResponse.json({ error: "vendor_required" }, { status: 403 });
  const nextStatus = parsed.data.decision === "confirm" ? "confirmed" : parsed.data.decision === "complete" ? "completed" : "declined";
  const { data, error } = await admin.from("store_visit_requests").update({ status: nextStatus }).eq("id", parsed.data.visitId).eq("vendor_id", vendor.id).in("status", parsed.data.decision === "complete" ? ["confirmed"] : ["requested"]).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: `store_visit.${parsed.data.decision}`, entity_type: "store_visit_request", entity_id: data.id, ip_address: ipFromRequest(request) });
  return NextResponse.json({ id: data.id, status: nextStatus });
}

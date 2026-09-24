import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { catalogueSupportUpdateSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = catalogueSupportUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data, error } = await admin.from("catalogue_support_requests").update({ status: parsed.data.status, admin_note: parsed.data.adminNote || null, assigned_to: auth.user.id }).eq("id", parsed.data.requestId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: profile.role, action: "catalogue_support.updated", entity_type: "catalogue_support_request", entity_id: parsed.data.requestId, new_value: parsed.data, ip_address: ipFromRequest(request) });
  return NextResponse.json({ ok: true });
}

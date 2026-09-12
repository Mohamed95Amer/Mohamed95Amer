import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { adminDeliveryCompanyDecisionSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = adminDeliveryCompanyDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const nextStatus = parsed.data.decision === "approve" ? "approved" : parsed.data.decision === "reject" ? "rejected" : "suspended";
  const { data: previous } = await admin.from("delivery_companies").select("verification_status").eq("id", parsed.data.deliveryCompanyId).maybeSingle();
  if (!previous) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await admin.from("delivery_companies").update({ verification_status: nextStatus, admin_notes: parsed.data.note ?? null }).eq("id", parsed.data.deliveryCompanyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile.role,
    action: `delivery_company.${parsed.data.decision}`,
    entity_type: "delivery_company",
    entity_id: parsed.data.deliveryCompanyId,
    old_value: { verification_status: previous.verification_status },
    new_value: { verification_status: nextStatus, note: parsed.data.note ?? null },
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}

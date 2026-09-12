import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { deliveryCompanyOnboardingSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = deliveryCompanyOnboardingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["customer", "delivery_company"].includes(profile.role)) {
    return NextResponse.json({ error: "This account already belongs to another business or platform role." }, { status: 409 });
  }

  const { data: existing } = await admin.from("delivery_companies").select("id, verification_status").eq("owner_user_id", auth.user.id).maybeSingle();
  const record = { ...parsed.data, owner_user_id: auth.user.id, verification_status: "pending" };
  const result = existing
    ? await admin.from("delivery_companies").update(record).eq("id", existing.id).select("id").single()
    : await admin.from("delivery_companies").insert(record).select("id").single();

  if (result.error || !result.data) return NextResponse.json({ error: result.error?.message ?? "save_failed" }, { status: 500 });

  await admin.from("profiles").update({ role: "delivery_company" }).eq("id", auth.user.id);
  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "delivery_company",
    action: existing ? "delivery_company.updated" : "delivery_company.created",
    entity_type: "delivery_company",
    entity_id: result.data.id,
    old_value: existing ? { verification_status: existing.verification_status } : undefined,
    new_value: parsed.data,
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ deliveryCompanyId: result.data.id, updated: Boolean(existing) });
}

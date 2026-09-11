import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { vendorOnboardingSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = vendorOnboardingSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["customer", "vendor"].includes(profile.role)) {
    return NextResponse.json({ error: "This account already belongs to another business or platform role." }, { status: 409 });
  }

  // Upsert by owner_user_id (unique). Status always reset to 'pending' on resubmit.
  const { data: existing } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("vendors")
      .update({ ...parsed.data, verification_status: "pending" })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("profiles").update({ role: "vendor" }).eq("id", auth.user.id);
    await logAudit({
      actor_user_id: auth.user.id,
      actor_role: "vendor",
      action: "vendor.updated",
      entity_type: "vendor",
      entity_id: existing.id,
      new_value: parsed.data,
      ip_address: ipFromRequest(request),
    });
    return NextResponse.json({ vendorId: existing.id, updated: true });
  }

  const { data, error } = await admin
    .from("vendors")
    .insert({ ...parsed.data, owner_user_id: auth.user.id })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  await admin.from("profiles").update({ role: "vendor" }).eq("id", auth.user.id);
  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: "vendor.created",
    entity_type: "vendor",
    entity_id: data.id,
    new_value: parsed.data,
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ vendorId: data.id, created: true });
}

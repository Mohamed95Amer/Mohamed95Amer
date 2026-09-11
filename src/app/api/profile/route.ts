import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: before } = await admin.from("profiles").select("full_name, phone, role").eq("id", auth.user.id).maybeSingle();
  const { error } = await admin.from("profiles").update(parsed.data).eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: before?.role ?? "customer",
    action: "profile.updated",
    entity_type: "profile",
    entity_id: auth.user.id,
    old_value: { full_name: before?.full_name, phone: before?.phone },
    new_value: parsed.data,
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ ok: true });
}

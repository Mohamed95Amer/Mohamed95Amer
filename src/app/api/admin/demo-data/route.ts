import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ demo_data_visible: z.boolean() });

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: previous } = await admin.from("platform_settings").select("demo_data_visible").eq("id", true).single();
  const { error } = await admin.from("platform_settings").update({ demo_data_visible: parsed.data.demo_data_visible }).eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile.role,
    action: "demo_data_visibility.updated",
    entity_type: "platform_settings",
    entity_id: "singleton",
    old_value: previous,
    new_value: parsed.data,
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ ok: true, demo_data_visible: parsed.data.demo_data_visible });
}

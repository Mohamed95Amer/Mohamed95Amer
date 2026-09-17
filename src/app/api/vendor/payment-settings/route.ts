import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { bankSettingsSchema } from "@/lib/payments/bank";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bankSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid vendor bank details." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).eq("verification_status", "approved").maybeSingle();
  if (!vendor) return NextResponse.json({ error: "approved_vendor_required" }, { status: 403 });
  const { error } = await admin.from("vendor_payment_settings").upsert({ vendor_id: vendor.id, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "vendor.bank_settings_updated", entity_type: "vendor", entity_id: vendor.id, new_value: { enabled: parsed.data.bank_transfer_enabled } });
  return NextResponse.json({ saved: true });
}

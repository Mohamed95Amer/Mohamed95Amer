import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { bankSettingsSchema } from "@/lib/payments/bank";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bankSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter valid payment details." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).eq("verification_status", "approved").maybeSingle();
  if (!vendor) return NextResponse.json({ error: "approved_vendor_required" }, { status: 403 });
  const { data: saved, error } = await admin.from("vendor_payment_settings")
    .upsert({ vendor_id: vendor.id, ...parsed.data, updated_at: new Date().toISOString() })
    .select("destination_verification_status")
    .single();
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "vendor.payment_settings_updated", entity_type: "vendor", entity_id: vendor.id, new_value: { bank_transfer_enabled: parsed.data.bank_transfer_enabled, aani_enabled: parsed.data.aani_enabled, destination_verification_status: saved.destination_verification_status, aani_mobile_last3: parsed.data.aani_enabled ? parsed.data.aani_mobile.slice(-3) : null, iban_last4: parsed.data.bank_transfer_enabled ? parsed.data.iban.slice(-4) : null } });
  return NextResponse.json({ saved: true, destinationVerificationStatus: saved.destination_verification_status });
}

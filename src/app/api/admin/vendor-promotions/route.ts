import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { adminCancelSchema, vendorPromotionCreateSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminContext() {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return null;
  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return null;
  return { user: auth.user, profile, admin };
}

export async function POST(request: Request) {
  const context = await adminContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = vendorPromotionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const { data: vendor } = await context.admin.from("vendors").select("id, business_name, verification_status").eq("id", parsed.data.vendorId).maybeSingle();
  if (!vendor || vendor.verification_status !== "approved") {
    return NextResponse.json({ error: "Only approved vendors can receive premium placement." }, { status: 409 });
  }
  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationDays * 86_400_000);
  const { data: overlap } = await context.admin.from("vendor_promotions").select("id").eq("vendor_id", vendor.id)
    .is("cancelled_at", null).lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString()).limit(1).maybeSingle();
  if (overlap) return NextResponse.json({ error: "This vendor already has premium placement during those dates." }, { status: 409 });

  const { data, error } = await context.admin.from("vendor_promotions").insert({
    vendor_id: vendor.id,
    label: parsed.data.label,
    reward_reason: parsed.data.rewardReason,
    admin_note: parsed.data.adminNote || null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by_user_id: context.user.id,
  }).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "create_failed" }, { status: 500 });
  await logAudit({ actor_user_id: context.user.id, actor_role: context.profile.role, action: "vendor_promotion.created", entity_type: "vendor_promotion", entity_id: data.id, new_value: data, ip_address: ipFromRequest(request) });
  return NextResponse.json({ promotion: data });
}

export async function DELETE(request: Request) {
  const context = await adminContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = adminCancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { data: previous } = await context.admin.from("vendor_promotions").select("*").eq("id", parsed.data.id).maybeSingle();
  if (!previous) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const now = new Date().toISOString();
  const { error } = await context.admin.from("vendor_promotions").update({ cancelled_at: now, cancelled_by_user_id: context.user.id }).eq("id", parsed.data.id).is("cancelled_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actor_user_id: context.user.id, actor_role: context.profile.role, action: "vendor_promotion.cancelled", entity_type: "vendor_promotion", entity_id: parsed.data.id, old_value: previous, new_value: { cancelled_at: now }, ip_address: ipFromRequest(request) });
  return NextResponse.json({ ok: true });
}

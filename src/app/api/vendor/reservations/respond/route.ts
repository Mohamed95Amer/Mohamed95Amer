import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { vendorResponseSchema } from "@/lib/validation/schemas";
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
  const parsed = vendorResponseSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (!vendor) return NextResponse.json({ error: "no_vendor" }, { status: 403 });

  const { data: reservation } = await admin
    .from("reservations")
    .select("id, vendor_id, status, expires_at")
    .eq("id", parsed.data.reservationId)
    .single();
  if (!reservation || reservation.vendor_id !== vendor.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (reservation.status !== "pending_vendor_confirmation") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }
  if (new Date(reservation.expires_at).getTime() < Date.now()) {
    await admin.from("reservations").update({ status: "expired" }).eq("id", reservation.id);
    return NextResponse.json({ error: "expired" }, { status: 409 });
  }

  const nextStatus =
    parsed.data.decision === "confirm" ? "payment_link_pending" : "rejected_by_vendor";

  const { error } = await admin
    .from("reservations")
    .update({
      status: nextStatus,
      vendor_response_note: parsed.data.note ?? null,
      vendor_responded_at: new Date().toISOString(),
    })
    .eq("id", reservation.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: `reservation.${parsed.data.decision}`,
    entity_type: "reservation",
    entity_id: reservation.id,
    old_value: { status: reservation.status },
    new_value: { status: nextStatus, note: parsed.data.note ?? null },
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ id: reservation.id, status: nextStatus });
}

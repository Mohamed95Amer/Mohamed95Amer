import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { adminPaymentDisputeSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = adminPaymentDisputeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_input" }, { status: 400 });
  }

  const { data: previous } = await admin.from("reservations")
    .select("id, payment_dispute_status, payment_dispute_note, payment_dispute_resolution_note, payment_status")
    .eq("id", parsed.data.reservationId).maybeSingle();
  if (!previous) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date().toISOString();
  const update = parsed.data.action === "report"
    ? {
        payment_dispute_status: "reported",
        payment_dispute_note: parsed.data.note,
        payment_dispute_resolution_note: null,
        payment_disputed_at: now,
        payment_dispute_resolved_at: null,
        payment_dispute_updated_by: auth.user.id,
      }
    : parsed.data.action === "resolve"
    ? {
        payment_dispute_status: "resolved",
        payment_dispute_resolution_note: parsed.data.note || "Resolved by Get Gold operations.",
        payment_dispute_resolved_at: now,
        payment_dispute_updated_by: auth.user.id,
      }
    : {
        payment_dispute_status: "none",
        payment_dispute_note: null,
        payment_dispute_resolution_note: null,
        payment_disputed_at: null,
        payment_dispute_resolved_at: null,
        payment_dispute_updated_by: auth.user.id,
      };

  const { data: changed, error } = await admin.from("reservations").update(update)
    .eq("id", previous.id).eq("payment_dispute_status", previous.payment_dispute_status)
    .select("id, payment_dispute_status").maybeSingle();
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  if (!changed) return NextResponse.json({ error: "order_changed" }, { status: 409 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile.role,
    action: `reservation.payment_dispute_${parsed.data.action}`,
    entity_type: "reservation",
    entity_id: previous.id,
    old_value: previous,
    new_value: update,
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ id: previous.id, status: changed.payment_dispute_status });
}

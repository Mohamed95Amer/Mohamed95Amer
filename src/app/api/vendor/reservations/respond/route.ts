import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { vendorResponseSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notifications/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
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
    .select("id, vendor_id, customer_user_id, status, expires_at, vendor_action_available_at, payment_method")
    .eq("id", parsed.data.reservationId)
    .single();
  if (!reservation || reservation.vendor_id !== vendor.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (reservation.status !== "pending_vendor_confirmation") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }
  if (new Date(reservation.vendor_action_available_at).getTime() > Date.now()) {
    return NextResponse.json({ error: "This request is queued until the store opens." }, { status: 409 });
  }
  if (new Date(reservation.expires_at).getTime() < Date.now()) {
    await admin.from("reservations").update({ status: "expired" }).eq("id", reservation.id).eq("status", "pending_vendor_confirmation");
    return NextResponse.json({ error: "expired" }, { status: 409 });
  }

  const nextStatus = parsed.data.decision === "confirm" ? "vendor_confirmed" : "rejected_by_vendor";
  let changed: unknown = null;
  let error: { message: string } | null = null;
  if (parsed.data.decision === "confirm") {
    const { data: paymentSettings } = await admin.from("vendor_payment_settings")
      .select("aani_enabled, aani_mobile, bank_transfer_enabled, bank_name, beneficiary_name, iban, destination_verification_status")
      .eq("vendor_id", vendor.id).maybeSingle();
    if (reservation.payment_method === "aani" && (!paymentSettings?.aani_enabled || paymentSettings.destination_verification_status !== "approved")) return NextResponse.json({ error: "Aani is unavailable until this store's payment destination is approved." }, { status: 409 });
    if (reservation.payment_method === "bank_transfer" && (!paymentSettings?.bank_transfer_enabled || paymentSettings.destination_verification_status !== "approved")) return NextResponse.json({ error: "Bank transfer is unavailable until this store's payment destination is approved." }, { status: 409 });
    const details = reservation.payment_method === "aani"
      ? { method: "aani", aani_mobile: paymentSettings?.aani_mobile }
      : reservation.payment_method === "bank_transfer"
      ? { method: "bank_transfer", bank_name: paymentSettings?.bank_name, beneficiary_name: paymentSettings?.beneficiary_name, iban: paymentSettings?.iban }
      : null;
    if (details) {
      const snapshot = await admin.from("reservations").update({ bank_details_snapshot: details }).eq("id", reservation.id).eq("status", "pending_vendor_confirmation");
      if (snapshot.error) return NextResponse.json({ error: "Could not secure the vendor payment details." }, { status: 500 });
    }
    const result = await admin.rpc("confirm_vendor_order_price", {
      p_reservation_id: reservation.id,
      p_vendor_user_id: auth.user.id,
      p_confirmed_price_aed: parsed.data.finalTotalAed,
      p_note: parsed.data.note ?? null,
    });
    changed = result.data;
    error = result.error;
  } else {
    const result = await admin
    .from("reservations")
    .update({
      status: nextStatus,
      vendor_response_note: parsed.data.note ?? null,
      vendor_responded_at: new Date().toISOString(),
      payment_status: "not_required",
    })
    .eq("id", reservation.id)
    .eq("status", "pending_vendor_confirmation")
    .lte("vendor_action_available_at", new Date().toISOString())
    .gt("expires_at", new Date().toISOString())
    .select("id").maybeSingle();
    changed = result.data;
    error = result.error;
  }
  if (error) {
    const conflict = error.message.includes("order_changed") || error.message.includes("not_open");
    return NextResponse.json({ error: conflict ? "order_changed_or_expired" : error.message }, { status: conflict ? 409 : 500 });
  }
  if (!changed) return NextResponse.json({ error: "order_changed_or_expired" }, { status: 409 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: `reservation.${parsed.data.decision}`,
    entity_type: "reservation",
    entity_id: reservation.id,
    old_value: { status: reservation.status },
    new_value: { status: nextStatus, note: parsed.data.note ?? null, final_total_aed: parsed.data.finalTotalAed ?? null },
    ip_address: ipFromRequest(request),
  });
  await notifyUser({ userId: reservation.customer_user_id, kind: "order", title: parsed.data.decision === "confirm" ? "Your final price is ready" : "The store could not confirm your request", body: parsed.data.decision === "confirm" ? "Review the vendor-confirmed amount. Payment details remain hidden until you accept it, and no payment has been taken." : (parsed.data.note || "The item is not available. No payment was taken."), href: `/account/reservations/${reservation.id}`, dedupeKey: `reservation-response:${reservation.id}:${parsed.data.decision}` });

  return NextResponse.json({ id: reservation.id, status: nextStatus });
}

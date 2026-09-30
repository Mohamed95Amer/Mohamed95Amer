import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { vendorOrderProgressSchema } from "@/lib/validation/schemas";
import { notifyUser } from "@/lib/notifications/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

const ACTION_COPY: Record<string, { title: string; body: string }> = {
  confirm_payment_received: { title: "Payment confirmed by the store", body: "The store verified the money in its own account and will now prepare your order." },
  start_preparing: { title: "Your order is being prepared", body: "The store has started preparing your confirmed order." },
  mark_ready: { title: "Your order is ready", body: "The store marked your order ready for delivery or collection." },
  mark_out_for_delivery: { title: "Your order is out for delivery", body: "The store marked your order as on the way." },
  mark_delivered: { title: "Your order was delivered", body: "The store marked the delivery as received." },
  complete: { title: "Order completed", body: "Your Get Gold order is complete. You can now review the store experience." },
};

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = vendorOrderProgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).eq("verification_status", "approved").maybeSingle();
  if (!vendor) return NextResponse.json({ error: "no_vendor" }, { status: 403 });
  const { data: reservation } = await admin.from("reservations")
    .select("id, vendor_id, customer_user_id, status, payment_method, fulfilment_method, expires_at")
    .eq("id", parsed.data.reservationId).maybeSingle();
  if (!reservation || reservation.vendor_id !== vendor.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let nextStatus: string;
  if (parsed.data.action === "confirm_payment_received") {
    if (["bank_transfer", "aani"].includes(reservation.payment_method)) {
      if (reservation.status !== "payment_verification") return NextResponse.json({ error: "Wait until the customer marks payment as sent." }, { status: 409 });
      const { error } = await admin.rpc("confirm_vendor_direct_payment", { p_reservation_id: reservation.id, p_vendor_user_id: auth.user.id });
      if (error) return NextResponse.json({ error: "Check the order state and confirm only cleared funds." }, { status: 409 });
    } else {
      if (reservation.status !== "payment_pending" || Date.parse(reservation.expires_at) <= Date.now()) return NextResponse.json({ error: "order_changed_or_expired" }, { status: 409 });
      const now = new Date().toISOString();
      const { data: changed, error } = await admin.from("reservations")
        .update({ status: "payment_confirmed", payment_status: "paid", payment_confirmed_at: now, payment_confirmed_by: auth.user.id, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
        .eq("id", reservation.id).eq("status", "payment_pending").gt("expires_at", now).select("id").maybeSingle();
      if (error || !changed) return NextResponse.json({ error: "order_changed_or_expired" }, { status: 409 });
    }
    nextStatus = "payment_confirmed";
    await admin.from("referral_attributions").update({ first_purchase_at: new Date().toISOString() }).eq("referred_user_id", reservation.customer_user_id).is("first_purchase_at", null);
  } else {
    const { data, error } = await admin.rpc("advance_vendor_order", { p_reservation_id: reservation.id, p_vendor_user_id: auth.user.id, p_action: parsed.data.action });
    if (error || !data) return NextResponse.json({ error: "invalid_order_transition" }, { status: 409 });
    nextStatus = data;
  }

  const copy = ACTION_COPY[parsed.data.action];
  await Promise.all([
    notifyUser({ userId: reservation.customer_user_id, kind: "order", title: copy.title, body: copy.body, href: `/account/reservations/${reservation.id}`, dedupeKey: `order-progress:${reservation.id}:${parsed.data.action}` }),
    logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: `reservation.${parsed.data.action}`, entity_type: "reservation", entity_id: reservation.id, old_value: { status: reservation.status }, new_value: { status: nextStatus }, ip_address: ipFromRequest(request) }),
  ]);
  return NextResponse.json({ id: reservation.id, status: nextStatus });
}

import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { customerConfirmedPriceSchema } from "@/lib/validation/schemas";
import { notifyUser } from "@/lib/notifications/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = customerConfirmedPriceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: order } = await admin.from("reservations")
    .select("id, vendor_id, customer_user_id, status, payment_method, expires_at")
    .eq("id", parsed.data.reservationId).eq("customer_user_id", auth.user.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (parsed.data.action === "cancel") {
    const { data: changed, error } = await admin.from("reservations")
      .update({ status: "cancelled", payment_status: "not_required" })
      .eq("id", order.id).in("status", ["pending_vendor_confirmation", "vendor_confirmed"])
      .select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!changed) return NextResponse.json({ error: "order_changed" }, { status: 409 });
    await logAudit({ actor_user_id: auth.user.id, actor_role: "customer", action: "reservation.cancelled_before_payment", entity_type: "reservation", entity_id: order.id, old_value: { status: order.status }, new_value: { status: "cancelled" }, ip_address: ipFromRequest(request) });
    return NextResponse.json({ id: order.id, status: "cancelled" });
  }

  if (order.status !== "vendor_confirmed" || Date.parse(order.expires_at) <= Date.now()) {
    return NextResponse.json({ error: "confirmed_price_expired" }, { status: 409 });
  }
  const paymentWindowMinutes = ["aani", "bank_transfer", "pay_online"].includes(order.payment_method) ? 30 : 1440;
  const { data: rawAccepted, error } = await admin.rpc("accept_vendor_confirmed_price", {
    p_reservation_id: order.id,
    p_customer_user_id: auth.user.id,
    p_payment_window_minutes: paymentWindowMinutes,
  }).single();
  const accepted = rawAccepted as { expires_at: string } | null;
  if (error || !accepted) {
    const message = error?.message ?? "accept_failed";
    if (message.includes("insufficient_stock")) return NextResponse.json({ error: "item_no_longer_available", message: "Another customer completed the stock hold first. No payment was taken." }, { status: 409 });
    return NextResponse.json({ error: "confirmed_price_expired" }, { status: 409 });
  }
  const { data: vendor } = await admin.from("vendors").select("owner_user_id").eq("id", order.vendor_id).maybeSingle();
  await Promise.all([
    vendor?.owner_user_id ? notifyUser({ userId: vendor.owner_user_id, kind: "order", title: "Customer accepted your price", body: ["aani", "bank_transfer"].includes(order.payment_method) ? "The item is held for 30 minutes while the customer pays you directly." : "The item is now reserved under the vendor-confirmed price.", href: "/vendor/orders", dedupeKey: `price-accepted:${order.id}` }) : Promise.resolve(),
    logAudit({ actor_user_id: auth.user.id, actor_role: "customer", action: "reservation.vendor_price_accepted", entity_type: "reservation", entity_id: order.id, old_value: { status: order.status }, new_value: { status: "payment_pending", payment_window_minutes: paymentWindowMinutes }, ip_address: ipFromRequest(request) }),
  ]);
  return NextResponse.json({ id: order.id, status: "payment_pending", expiresAt: accepted.expires_at });
}

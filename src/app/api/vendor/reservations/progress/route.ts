import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { vendorOrderProgressSchema } from "@/lib/validation/schemas";
import { notifyUser } from "@/lib/notifications/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const userClient = await getServerSupabase(); const { data: auth } = await userClient.auth.getUser(); if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); const parsed = vendorOrderProgressSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 }); const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).maybeSingle(); if (!vendor) return NextResponse.json({ error: "no_vendor" }, { status: 403 }); const { data: reservation } = await admin.from("reservations").select("id, vendor_id, customer_user_id, status, payment_method").eq("id", parsed.data.reservationId).maybeSingle();
  if (!reservation || reservation.vendor_id !== vendor.id) return NextResponse.json({ error: "not_found" }, { status: 404 }); if (reservation.status !== "payment_pending" || reservation.payment_method !== "pay_at_store") return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  const { error } = await admin.from("reservations").update({ status: "paid", payment_status: "paid" }).eq("id", reservation.id).eq("status", "payment_pending"); if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("referral_attributions").update({ first_purchase_at: new Date().toISOString() }).eq("referred_user_id", reservation.customer_user_id).is("first_purchase_at", null);
  await Promise.all([notifyUser({ userId: reservation.customer_user_id, kind: "order", title: "Purchase completed", body: "The store confirmed receipt of payment. Your purchase history and gold-value insights are now active.", href: `/account/reservations/${reservation.id}`, dedupeKey: `purchase-complete:${reservation.id}` }), logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "reservation.payment_received", entity_type: "reservation", entity_id: reservation.id, old_value: { status: reservation.status }, new_value: { status: "paid" }, ip_address: ipFromRequest(request) })]); return NextResponse.json({ id: reservation.id, status: "paid" });
}


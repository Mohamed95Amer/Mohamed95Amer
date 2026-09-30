import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { deliveryAssignmentSchema } from "@/lib/validation/schemas";
import { notifyUser } from "@/lib/notifications/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { dubaiTodayIso } from "@/lib/time";

export async function POST(request: Request) {
  const userClient = await getServerSupabase(); const { data: auth } = await userClient.auth.getUser(); if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = deliveryAssignmentSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 }); const admin = getServiceSupabase();
  const [{ data: vendor }, { data: reservation }, { data: company }] = await Promise.all([
    admin.from("vendors").select("id, business_name").eq("owner_user_id", auth.user.id).maybeSingle(),
    admin.from("reservations").select("id, vendor_id, customer_user_id, fulfilment_method, delivery_emirate, status, payment_method, payment_status, expires_at").eq("id", parsed.data.reservationId).maybeSingle(),
    admin.from("delivery_companies").select("id, owner_user_id, company_name, verification_status, license_expiry_date, emirates_served").eq("id", parsed.data.deliveryCompanyId).maybeSingle(),
  ]);
  if (!vendor || !reservation || reservation.vendor_id !== vendor.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (reservation.payment_status !== "paid") return NextResponse.json({ error: "payment_not_confirmed" }, { status: 409 });
  if (reservation.fulfilment_method !== "delivery" || !["payment_confirmed", "preparing_order", "ready_for_delivery", "out_for_delivery", "paid"].includes(reservation.status)) return NextResponse.json({ error: "order_not_ready_for_delivery" }, { status: 409 });
  if (!company || company.verification_status !== "approved" || company.license_expiry_date < dubaiTodayIso() || !company.emirates_served.includes(reservation.delivery_emirate)) return NextResponse.json({ error: "delivery_company_not_eligible" }, { status: 400 });
  const { data: existing } = await admin.from("delivery_assignments").select("id, status").eq("reservation_id", reservation.id).maybeSingle(); if (existing && !["declined", "cancelled"].includes(existing.status)) return NextResponse.json({ error: "delivery_already_assigned" }, { status: 409 });
  if (existing) await admin.from("delivery_assignments").delete().eq("id", existing.id);
  const { data, error } = await admin.from("delivery_assignments").insert({ reservation_id: reservation.id, delivery_company_id: company.id, assigned_by_user_id: auth.user.id, public_note: parsed.data.publicNote ?? null }).select("id, tracking_code").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "assignment_failed" }, { status: 500 });
  await Promise.all([
    notifyUser({ userId: reservation.customer_user_id, kind: "delivery", title: "A delivery partner was assigned", body: `${company.company_name} has received your delivery request. Track progress from your order.`, href: `/account/reservations/${reservation.id}`, dedupeKey: `delivery-assigned:${data.id}:customer` }),
    notifyUser({ userId: company.owner_user_id, kind: "delivery", title: "New delivery assignment", body: `${vendor.business_name} assigned order ${data.tracking_code}. Review and accept it in your delivery dashboard.`, href: "/delivery", dedupeKey: `delivery-assigned:${data.id}:company` }),
    trackServerEvent({ eventName: "delivery_assigned", userId: auth.user.id, vendorId: vendor.id, reservationId: reservation.id }),
    logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "delivery.assigned", entity_type: "delivery_assignment", entity_id: data.id, new_value: { reservation_id: reservation.id, company_id: company.id }, ip_address: ipFromRequest(request) }),
  ]);
  return NextResponse.json(data);
}

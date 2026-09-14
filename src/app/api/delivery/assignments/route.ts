import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { deliveryStatusSchema } from "@/lib/validation/schemas";
import { notifyUser } from "@/lib/notifications/server";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { dubaiTodayIso } from "@/lib/time";
import { canTransitionDelivery } from "@/lib/delivery/transitions";

export async function POST(request: Request) {
  const userClient = await getServerSupabase(); const { data: auth } = await userClient.auth.getUser(); if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); const parsed = deliveryStatusSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 }); const admin = getServiceSupabase();
  const { data: company } = await admin.from("delivery_companies").select("id, company_name, verification_status, license_expiry_date").eq("owner_user_id", auth.user.id).maybeSingle(); if (!company || company.verification_status !== "approved" || company.license_expiry_date < dubaiTodayIso()) return NextResponse.json({ error: "approved_delivery_company_required" }, { status: 403 });
  const { data: assignment } = await admin.from("delivery_assignments").select("id, status, reservation_id, reservation:reservations(customer_user_id, vendor:vendors(owner_user_id))").eq("id", parsed.data.assignmentId).eq("delivery_company_id", company.id).maybeSingle(); if (!assignment) return NextResponse.json({ error: "not_found" }, { status: 404 }); if (!canTransitionDelivery(assignment.status, parsed.data.status)) return NextResponse.json({ error: "invalid_delivery_transition" }, { status: 409 });
  const now = new Date().toISOString(); const timestamps = parsed.data.status === "accepted" ? { accepted_at: now } : parsed.data.status === "collected" ? { picked_up_at: now } : parsed.data.status === "delivered" ? { delivered_at: now } : {};
  // Compare-and-set: two tabs cannot apply contradictory updates to the same
  // observed state. Notify and audit only after a row was actually changed.
  const { data: changed, error } = await admin.from("delivery_assignments")
    .update({ status: parsed.data.status, public_note: parsed.data.publicNote ?? null, proof_reference: parsed.data.proofReference ?? null, ...timestamps })
    .eq("id", assignment.id).eq("delivery_company_id", company.id)
    .eq("status", assignment.status).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "delivery_update_failed" }, { status: 500 });
  if (!changed) return NextResponse.json({ error: "delivery_changed", message: "This assignment changed. Refresh before trying again." }, { status: 409 });
  const reservation = assignment.reservation as unknown as { customer_user_id: string; vendor: { owner_user_id: string } | Array<{ owner_user_id: string }> | null } | null; const vendorOwner = Array.isArray(reservation?.vendor) ? reservation.vendor[0] : reservation?.vendor; const label = parsed.data.status.replaceAll("_", " "); const notices = [] as Promise<unknown>[]; if (reservation?.customer_user_id) notices.push(notifyUser({ userId: reservation.customer_user_id, kind: "delivery", title: `Delivery ${label}`, body: parsed.data.publicNote || `${company.company_name} updated your delivery.`, href: `/account/reservations/${assignment.reservation_id}`, dedupeKey: `delivery-status:${assignment.id}:${parsed.data.status}:customer` })); if (vendorOwner?.owner_user_id) notices.push(notifyUser({ userId: vendorOwner.owner_user_id, kind: "delivery", title: `Delivery ${label}`, body: `${company.company_name} updated the assigned order.`, href: "/vendor/orders", dedupeKey: `delivery-status:${assignment.id}:${parsed.data.status}:vendor` })); await Promise.all(notices);
  await logAudit({ actor_user_id: auth.user.id, actor_role: "delivery_company", action: `delivery.${parsed.data.status}`, entity_type: "delivery_assignment", entity_id: assignment.id, old_value: { status: assignment.status }, new_value: { status: parsed.data.status }, ip_address: ipFromRequest(request) }); return NextResponse.json({ id: assignment.id, status: parsed.data.status });
}

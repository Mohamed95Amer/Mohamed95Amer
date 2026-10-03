import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { buyerRequestOfferSchema } from "@/lib/validation/schemas";
import { distributedRateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications/server";
import { dubaiTodayIso } from "@/lib/time";
import { listingFreshCutoff } from "@/lib/products/integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await distributedRateLimit(`request-offer:${auth.user.id}`, 10, 60_000)).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = buyerRequestOfferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const admin = getServiceSupabase();
  const [{ data: vendor }, { data: buyerRequest }] = await Promise.all([
    admin.from("vendors").select("id, verification_status, license_expiry_date").eq("owner_user_id", auth.user.id).maybeSingle(),
    admin.from("buyer_requests").select("id, customer_user_id, status, expires_at").eq("id", parsed.data.requestId).maybeSingle(),
  ]);
  if (!vendor || vendor.verification_status !== "approved" || vendor.license_expiry_date < dubaiTodayIso()) return NextResponse.json({ error: "approved_vendor_required" }, { status: 403 });
  if (!buyerRequest || buyerRequest.status !== "open" || new Date(buyerRequest.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "request_not_open" }, { status: 409 });
  }
  if (parsed.data.productId) {
    const { data: settings } = await admin.from("platform_settings").select("listing_fresh_days").eq("id", true).maybeSingle();
    const { data: linked } = await admin.from("products").select("id").eq("id", parsed.data.productId).eq("vendor_id", vendor.id).eq("product_status", "approved").eq("data_quality_status", "valid").gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45))).maybeSingle();
    if (!linked) return NextResponse.json({ error: "offer_product_not_available" }, { status: 400 });
  }

  const { data: existing } = await admin.from("buyer_request_offers").select("id, status").eq("buyer_request_id", parsed.data.requestId).eq("vendor_id", vendor.id).maybeSingle();
  if (existing && existing.status === "accepted") return NextResponse.json({ error: "accepted_offer_locked" }, { status: 409 });
  const values = {
    buyer_request_id: parsed.data.requestId,
    vendor_id: vendor.id,
    product_id: parsed.data.productId ?? null,
    total_price_aed: parsed.data.totalPriceAed,
    making_charge_aed: parsed.data.makingChargeAed,
    certificate_fee_aed: parsed.data.certificateFeeAed,
    estimated_days: parsed.data.estimatedDays,
    supports_delivery: parsed.data.supportsDelivery,
    note: parsed.data.note,
    status: "submitted",
    valid_until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  };
  const query = existing
    ? admin.from("buyer_request_offers").update(values).eq("id", existing.id).select("id").single()
    : admin.from("buyer_request_offers").insert(values).select("id").single();
  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ error: error?.message ?? "offer_failed" }, { status: 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: existing ? "buyer_request.offer_updated" : "buyer_request.offer_created", entity_type: "buyer_request_offer", entity_id: data.id, ip_address: ipFromRequest(request) });
  await notifyUser({ userId: buyerRequest.customer_user_id, kind: "offer", title: existing ? "A store updated its offer" : "A verified store sent an offer", body: parsed.data.productId ? "The offer links to ready inventory, so you can review it and continue through secure checkout." : "Review the price, timing and store details in your gold request.", href: "/account/requests", dedupeKey: `request-offer:${data.id}:${existing ? "updated" : "created"}` });
  return NextResponse.json({ id: data.id });
}

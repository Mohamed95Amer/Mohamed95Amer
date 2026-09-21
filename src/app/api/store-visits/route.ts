import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { storeVisitRequestSchema } from "@/lib/validation/schemas";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { dubaiTodayIso } from "@/lib/time";
import { notifyUser } from "@/lib/notifications/server";
import { trackServerEvent } from "@/lib/analytics/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`store-visit:${auth.user.id}`, 5, 60_000).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = storeVisitRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "customer") return NextResponse.json({ error: "customer_account_required" }, { status: 403 });
  const { data: settings } = await admin.from("platform_settings").select("listing_fresh_days, demo_data_visible").eq("id", true).maybeSingle();
  let productQuery = admin.from("products").select("id, vendor_id, product_status, quantity, vendors!inner(verification_status, license_expiry_date, is_demo)").eq("id", parsed.data.productId).eq("vendors.verification_status", "approved").gte("vendors.license_expiry_date", dubaiTodayIso()).eq("data_quality_status", "valid").gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45)));
  if (settings?.demo_data_visible === false) productQuery = productQuery.eq("is_demo", false).eq("vendors.is_demo", false);
  const { data: product } = await productQuery.maybeSingle();
  if (!product || product.product_status !== "approved" || Number(product.quantity) < 1) return NextResponse.json({ error: "product_unavailable" }, { status: 409 });
  const { data, error } = await admin.from("store_visit_requests").insert({
    customer_user_id: auth.user.id,
    product_id: product.id,
    vendor_id: product.vendor_id,
    preferred_at: parsed.data.preferredAt,
    phone: parsed.data.phone,
    note: parsed.data.note || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "visit_failed" }, { status: 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "customer", action: "store_visit.requested", entity_type: "store_visit_request", entity_id: data.id, ip_address: ipFromRequest(request) });
  const { data: vendor } = await admin.from("vendors").select("owner_user_id").eq("id", product.vendor_id).maybeSingle();
  await Promise.all([
    vendor?.owner_user_id ? notifyUser({ userId: vendor.owner_user_id, kind: "order", title: "New store visit request", body: "A customer selected a time to inspect an item. Confirm or decline it from Orders.", href: "/vendor/orders", dedupeKey: `store-visit:${data.id}:vendor` }) : Promise.resolve(),
    trackServerEvent({ eventName: "store_visit_requested", userId: auth.user.id, productId: product.id, vendorId: product.vendor_id }),
  ]);
  return NextResponse.json({ id: data.id });
}

import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { favouriteSchema, priceAlertSchema } from "@/lib/validation/schemas";
import { trackServerEvent } from "@/lib/analytics/server";
import { dubaiTodayIso } from "@/lib/time";
import { listingFreshCutoff } from "@/lib/products/integrity";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = priceAlertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: settings } = await admin.from("platform_settings").select("listing_fresh_days").eq("id", true).maybeSingle();
  const { data: product } = await admin.from("products").select("id, vendor_id, product_status, vendors!inner(verification_status, license_expiry_date)").eq("id", parsed.data.productId).eq("product_status", "approved").eq("data_quality_status", "valid").eq("vendors.verification_status", "approved").gte("vendors.license_expiry_date", dubaiTodayIso()).gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45))).maybeSingle();
  if (!product || product.product_status !== "approved") return NextResponse.json({ error: "product_not_found" }, { status: 404 });
  const { data, error } = await admin.from("price_alerts").upsert({
    user_id: auth.user.id,
    product_id: product.id,
    target_total_aed: parsed.data.targetTotalAed ?? null,
    notify_on_making_offer: parsed.data.notifyOnMakingOffer,
    active: true,
  }, { onConflict: "user_id,product_id" }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await trackServerEvent({ eventName: "alert_created", userId: auth.user.id, productId: product.id, vendorId: product.vendor_id });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = favouriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { error } = await getServiceSupabase().from("price_alerts").update({ active: false }).eq("user_id", auth.user.id).eq("product_id", parsed.data.productId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

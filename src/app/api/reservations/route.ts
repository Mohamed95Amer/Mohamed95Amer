import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { computeOfficialPriceForProduct } from "@/lib/pricing/server";
import { createReservationSchema } from "@/lib/validation/schemas";
import { rateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a reservation. The price is computed entirely server-side and
 * snapshotted into order_price_snapshots. The frontend's displayed price is
 * advisory only — this endpoint is the source of truth.
 */
export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`res:${auth.user.id}`, env.reservationsPerMin(), 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createReservationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  let priced;
  try {
    priced = await computeOfficialPriceForProduct(parsed.data.productId, parsed.data.quantity);
  } catch (err) {
    const message = err instanceof Error ? err.message : "pricing_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!priced.isFresh) {
    return NextResponse.json(
      {
        error: "price_stale",
        message:
          "The live gold price has not refreshed recently. Please retry in a few seconds — reservations are disabled while pricing is stale.",
        tick_fetched_at: priced.tick.fetched_at,
      },
      { status: 409 },
    );
  }

  // Persist with service role so RLS doesn't fight us on related rows.
  const admin = getServiceSupabase();

  const { data: settings } = await admin
    .from("platform_settings")
    .select("reservation_lock_minutes")
    .eq("id", true)
    .single();
  const lockMinutes = settings?.reservation_lock_minutes ?? env.reservationLockMinutes();
  const expiresAt = new Date(Date.now() + lockMinutes * 60_000).toISOString();

  const { data: reservation, error: resErr } = await admin
    .from("reservations")
    .insert({
      customer_user_id: auth.user.id,
      product_id: priced.product.id,
      vendor_id: priced.product.vendor_id,
      status: "pending_vendor_confirmation",
      quantity: parsed.data.quantity,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (resErr || !reservation) {
    return NextResponse.json({ error: resErr?.message ?? "insert_failed" }, { status: 500 });
  }

  const { error: snapErr } = await admin.from("order_price_snapshots").insert({
    reservation_id: reservation.id,
    gold_tick_id: priced.tick.id,
    gold_price_per_gram_24k_aed: priced.tick.price_per_gram_24k_aed,
    karat: priced.product.karat,
    karat_purity_factor: priced.breakdown.purityFactor,
    weight_grams: priced.product.weight_grams,
    making_charge: priced.breakdown.makingCharge,
    stone_value: priced.breakdown.stoneValue,
    vendor_premium: priced.breakdown.vendorPremium,
    platform_fee: priced.breakdown.platformFee,
    delivery_fee: priced.breakdown.deliveryFee,
    quantity: parsed.data.quantity,
    gold_value_aed: priced.breakdown.goldValueAed,
    unit_price_aed: priced.breakdown.unitPriceAed,
    total_price_aed: priced.totalPriceAed,
    gold_price_fetched_at: priced.tick.fetched_at,
  });

  if (snapErr) {
    // Roll back the reservation — there must be no reservation without a snapshot.
    await admin.from("reservations").delete().eq("id", reservation.id);
    return NextResponse.json({ error: snapErr.message }, { status: 500 });
  }

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "customer",
    action: "reservation.created",
    entity_type: "reservation",
    entity_id: reservation.id,
    new_value: { total: priced.totalPriceAed, tick_id: priced.tick.id, expires_at: expiresAt },
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({
    reservation,
    snapshot: {
      total_price_aed: priced.totalPriceAed,
      unit_price_aed: priced.breakdown.unitPriceAed,
      gold_price_fetched_at: priced.tick.fetched_at,
      expires_at: expiresAt,
    },
  });
}

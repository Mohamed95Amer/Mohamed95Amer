import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { computeOfficialPriceForProduct } from "@/lib/pricing/server";
import { createReservationSchema } from "@/lib/validation/schemas";
import { rateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Row returned by the claim_reservation() DB function. */
interface ReservationRow {
  id: string;
  customer_user_id: string;
  product_id: string;
  vendor_id: string;
  status: string;
  quantity: number;
  expires_at: string;
  identity_verification_id: string;
  fulfilment_method: string;
  created_at: string;
  updated_at: string;
}

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
    priced = await computeOfficialPriceForProduct(
      parsed.data.productId,
      parsed.data.quantity,
      parsed.data.fulfilmentMethod,
    );
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

  // Claim through the DB function rather than a bare insert: it locks the
  // product row and counts in-flight reservations, so two customers racing for
  // the last unit cannot both succeed.
  const { data: claimed, error: resErr } = await admin
    .rpc("claim_reservation", {
      p_customer_user_id: auth.user.id,
      p_product_id: priced.product.id,
      p_quantity: parsed.data.quantity,
      p_expires_at: expiresAt,
      p_identity_verification_id: parsed.data.identityVerificationId,
      p_fulfilment_method: parsed.data.fulfilmentMethod,
      p_recipient_name: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.recipientName : null,
      p_recipient_phone: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.recipientPhone : null,
      p_delivery_emirate: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryEmirate : null,
      p_delivery_area: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryArea : null,
      p_delivery_address_line_1: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryAddressLine1 : null,
      p_delivery_address_line_2: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryAddressLine2 : null,
      p_delivery_landmark: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryLandmark : null,
      p_delivery_latitude: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryLatitude : null,
      p_delivery_longitude: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryLongitude : null,
      p_delivery_map_link: parsed.data.fulfilmentMethod === "delivery" ? parsed.data.deliveryMapLink : null,
      p_customer_note: parsed.data.customerNote,
    })
    .single();
  const reservation = claimed as ReservationRow | null;

  if (resErr || !reservation) {
    const raw = resErr?.message ?? "insert_failed";
    // The function signals contention and validation failures by raising.
    if (raw.includes("insufficient_stock")) {
      return NextResponse.json(
        { error: "insufficient_stock", message: "That item was just reserved by someone else." },
        { status: 409 },
      );
    }
    if (raw.includes("product_not_available") || raw.includes("product_not_found")) {
      return NextResponse.json({ error: "product_unavailable" }, { status: 400 });
    }
    if (raw.includes("invalid_quantity")) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    }
    if (raw.includes("delivery_details_required") || raw.includes("invalid_delivery_coordinates")) {
      return NextResponse.json(
        { error: "invalid_delivery_details", message: "Check the delivery address and location pin." },
        { status: 400 },
      );
    }
    if (raw.includes("identity_verification")) {
      const expired = raw.includes("expired");
      const alreadyUsed = raw.includes("already_used");
      return NextResponse.json(
        {
          error: expired ? "identity_verification_expired" : "identity_verification_required",
          message: alreadyUsed
            ? "This identity check has already been used. Complete a new check for this order."
            : expired
            ? "The identity check expired. Complete a new check for this order."
            : "Complete the mandatory identity check before placing this order.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: raw }, { status: 500 });
  }

  const { error: snapErr } = await admin.from("order_price_snapshots").insert({
    reservation_id: reservation.id,
    gold_tick_id: priced.tick.id,
    gold_price_per_gram_24k_aed: priced.tick.price_per_gram_24k_aed,
    karat: priced.product.karat,
    karat_purity_factor: priced.breakdown.purityFactor,
    weight_grams: priced.product.weight_grams,
    making_charge: priced.breakdown.makingCharge,
    original_making_charge: priced.breakdown.makingChargeOriginal,
    making_charge_discount_percent: priced.breakdown.makingChargeDiscountPercent,
    making_charge_offer_ends_at: priced.breakdown.makingChargeOfferEndsAt,
    certificate_fee: priced.breakdown.certificateFee,
    stone_value: priced.breakdown.stoneValue,
    vendor_premium: priced.breakdown.vendorPremium,
    platform_fee: priced.breakdown.platformFee,
    platform_fee_bps: priced.breakdown.platformFeeBps,
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
    // The claim consumed the single-use identity result in the same DB
    // transaction. If the follow-up price snapshot fails, release it as part of
    // this API-level rollback so the customer can safely retry.
    await admin
      .from("order_identity_verifications")
      .update({ status: "approved", consumed_at: null, reservation_id: null })
      .eq("id", parsed.data.identityVerificationId)
      .eq("user_id", auth.user.id);
    return NextResponse.json({ error: snapErr.message }, { status: 500 });
  }

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "customer",
    action: "reservation.created",
    entity_type: "reservation",
    entity_id: reservation.id,
    new_value: {
      total: priced.totalPriceAed,
      tick_id: priced.tick.id,
      expires_at: expiresAt,
      fulfilment_method: parsed.data.fulfilmentMethod,
    },
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

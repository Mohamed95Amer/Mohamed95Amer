import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { computeOfficialPriceForProduct } from "@/lib/pricing/server";
import { createReservationSchema } from "@/lib/validation/schemas";
import { distributedRateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { onlinePaymentCheckoutIsOperational } from "@/lib/payments/readiness";
import { notifyUser } from "@/lib/notifications/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { diditIsConfigured } from "@/lib/identity/didit";
import { applyCustomerServiceFee, computeOrderPricing } from "@/lib/pricing/calc";
import { applyEventFeeDiscount } from "@/lib/marketing";
import { vendorRequestTiming, type VendorWorkingHour } from "@/lib/vendors/working-hours";

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

interface CustomerFeeAllocationRow {
  effective_bps: number;
  standard_bps: number;
  discount_percent: number;
  promo_order_number: number | null;
}

/**
 * Create a reservation. The price is computed entirely server-side and
 * snapshotted into order_price_snapshots. The frontend's displayed price is
 * advisory only — this endpoint is the source of truth.
 */
export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!diditIsConfigured()) {
    return NextResponse.json({ error: "identity_provider_not_configured" }, { status: 503 });
  }

  const rl = await distributedRateLimit(`res:${auth.user.id}`, env.reservationsPerMin(), 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "customer") return NextResponse.json({ error: "customer_account_required" }, { status: 403 });

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
  const { data: settings } = await admin
    .from("platform_settings")
    .select("reservation_lock_minutes, online_payments_enabled")
    .eq("id", true)
    .single();
  if (parsed.data.paymentMethod === "pay_online" && (!settings?.online_payments_enabled || !onlinePaymentCheckoutIsOperational())) {
    return NextResponse.json({ error: "online_payment_unavailable", message: "Online checkout is not active yet. Choose pay at store to continue." }, { status: 409 });
  }
  const [{ data: vendorOptions }, { data: workingHours }] = await Promise.all([
    admin.from("vendor_payment_settings").select("aani_enabled, aani_mobile, bank_transfer_enabled, bank_name, beneficiary_name, iban, cash_enabled, card_enabled, delivery_mode, courier_name, destination_verification_status").eq("vendor_id", priced.product.vendor_id).maybeSingle(),
    admin.from("vendor_working_hours").select("day_of_week, is_open, opens_at, closes_at").eq("vendor_id", priced.product.vendor_id).order("day_of_week"),
  ]);
  if ((["cash", "pay_at_store"].includes(parsed.data.paymentMethod) && vendorOptions?.cash_enabled === false) || (parsed.data.paymentMethod === "card" && !vendorOptions?.card_enabled)) return NextResponse.json({ error: "payment_method_unavailable" }, { status: 409 });
  if (parsed.data.paymentMethod === "bank_transfer" && (!vendorOptions?.bank_transfer_enabled || vendorOptions.destination_verification_status !== "approved")) return NextResponse.json({ error: "bank_transfer_unavailable" }, { status: 409 });
  if (parsed.data.paymentMethod === "aani" && (!vendorOptions?.aani_enabled || vendorOptions.destination_verification_status !== "approved")) return NextResponse.json({ error: "aani_unavailable" }, { status: 409 });
  let timing;
  try { timing = vendorRequestTiming(workingHours as VendorWorkingHour[] | null); }
  catch { return NextResponse.json({ error: "store_schedule_unavailable" }, { status: 409 }); }
  const expiresAt = timing.requestExpiresAt.toISOString();

  // The request itself does not hold stock.  It is still created through a DB
  // function so the single-use identity result is consumed transactionally.
  // Stock is acquired later by accept_vendor_confirmed_price(), under a product
  // row lock, after the customer accepts the vendor-confirmed amount.
  const { data: claimed, error: resErr } = await admin
    .rpc("create_vendor_order_request", {
      p_customer_user_id: auth.user.id,
      p_product_id: priced.product.id,
      p_quantity: parsed.data.quantity,
      p_expires_at: expiresAt,
      p_vendor_action_available_at: timing.availableAt.toISOString(),
      p_submitted_during_working_hours: timing.isOpenNow,
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
    // The function signals validation failures by raising.  Stock contention
    // is intentionally checked only when the customer accepts the final price.
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

  const { data: rawFeeOffer, error: feeOfferError } = await admin.rpc("assign_customer_fee_discount", {
    p_reservation_id: reservation.id, p_customer_user_id: auth.user.id,
  }).single();
  const feeOffer = rawFeeOffer as CustomerFeeAllocationRow | null;
  if (feeOfferError || !feeOffer) {
    await admin.from("reservations").delete().eq("id", reservation.id);
    await admin.from("order_identity_verifications").update({ status: "approved", consumed_at: null, reservation_id: null }).eq("id", parsed.data.identityVerificationId).eq("user_id", auth.user.id);
    return NextResponse.json({ error: "fee_assignment_failed" }, { status: 500 });
  }
  const eventFeeDiscount = priced.marketplacePromotion?.serviceFeeDiscountPercent ?? 0;
  const finalFeeBps = applyEventFeeDiscount(Number(feeOffer.effective_bps), eventFeeDiscount);
  priced.breakdown = applyCustomerServiceFee(priced.breakdown, finalFeeBps);
  const orderPricing = computeOrderPricing(priced.breakdown, parsed.data.quantity);
  priced.totalPriceAed = orderPricing.totalAed;
  const { error: snapErr } = await admin.from("order_price_snapshots").insert({
    vendor_commission_basis: "paused",
    vendor_commission_standard_aed: 0,
    vendor_commission_aed: 0,
    customer_fee_standard_bps: Number(feeOffer.standard_bps),
    customer_fee_discount_percent: Number(feeOffer.discount_percent),
    customer_fee_promo_order_number: feeOffer.promo_order_number,
    marketplace_promotion_id: priced.marketplacePromotion?.id ?? null,
    marketplace_promotion_title: priced.marketplacePromotion?.title ?? null,
    service_fee_event_discount_percent: eventFeeDiscount,
    delivery_event_discount_percent: priced.marketplacePromotion?.deliveryDiscountPercent ?? 0,
    delivery_fee_before_event_discount: priced.deliveryFeeBeforeEventDiscount,
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
    vendor_rate_adjustment_per_gram: priced.breakdown.vendorRateAdjustmentPerGram,
    vendor_rate_adjustment_aed: priced.breakdown.vendorRateAdjustmentAed,
    assay_fineness: priced.breakdown.assayFineness,
    platform_fee: priced.breakdown.platformFee,
    platform_fee_bps: priced.breakdown.platformFeeBps,
    delivery_fee: priced.breakdown.deliveryFee,
    delivery_fee_basis: "per_order",
    vat_rate_bps: priced.breakdown.vatRateBps,
    vat_taxable_amount_aed: orderPricing.subtotalBeforeVatAed,
    vat_aed: orderPricing.vatAed,
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

  const paymentStatus = "awaiting_store_confirmation";
  const { error: paymentPreferenceError } = await admin.from("reservations").update({
    payment_method: parsed.data.paymentMethod,
    payment_status: paymentStatus,
    bank_details_snapshot: null,
    vendor_delivery_snapshot: parsed.data.fulfilmentMethod === "delivery" ? { mode: vendorOptions?.delivery_mode ?? "own_staff", courier_name: vendorOptions?.courier_name ?? "" } : null,
  }).eq("id", reservation.id);
  if (paymentPreferenceError) {
    await admin.from("reservations").delete().eq("id", reservation.id);
    await admin.from("order_identity_verifications").update({ status: "approved", consumed_at: null, reservation_id: null }).eq("id", parsed.data.identityVerificationId).eq("user_id", auth.user.id);
    return NextResponse.json({ error: paymentPreferenceError.message }, { status: 500 });
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
      request_expires_at: expiresAt,
      vendor_action_available_at: timing.availableAt.toISOString(),
      fulfilment_method: parsed.data.fulfilmentMethod,
      payment_method: parsed.data.paymentMethod,
      marketplace_promotion_id: priced.marketplacePromotion?.id ?? null,
    },
    ip_address: ipFromRequest(request),
  });
  const { data: vendorOwner } = await admin.from("vendors").select("owner_user_id").eq("id", reservation.vendor_id).maybeSingle();
  await Promise.all([
    vendorOwner?.owner_user_id ? notifyUser({ userId: vendorOwner.owner_user_id, kind: "order", title: "New purchase request", body: "A verified customer is waiting for availability and final-price confirmation. No payment or stock hold exists yet.", href: "/vendor/orders", dedupeKey: `reservation-created:${reservation.id}:vendor`, availableAt: timing.availableAt.toISOString() }) : Promise.resolve(),
    notifyUser({ userId: auth.user.id, kind: "order", title: timing.isOpenNow ? "Request sent to the store" : "Request queued until the store opens", body: "Do not pay yet. The store must confirm availability and the final current price first.", href: `/account/reservations/${reservation.id}`, dedupeKey: `reservation-created:${reservation.id}:customer` }),
    trackServerEvent({ eventName: "reservation_created", userId: auth.user.id, productId: reservation.product_id, vendorId: reservation.vendor_id, reservationId: reservation.id, metadata: { fulfilment: parsed.data.fulfilmentMethod, payment: parsed.data.paymentMethod } }),
  ]);

  return NextResponse.json({
    reservation: { ...reservation, payment_method: parsed.data.paymentMethod, payment_status: paymentStatus },
    snapshot: {
      total_price_aed: priced.totalPriceAed,
      unit_price_aed: priced.breakdown.unitPriceAed,
      gold_price_fetched_at: priced.tick.fetched_at,
      request_expires_at: expiresAt,
      vendor_action_available_at: timing.availableAt.toISOString(),
    },
  });
}

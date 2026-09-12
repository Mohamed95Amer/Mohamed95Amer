import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { reviewUpsertSchema } from "@/lib/validation/schemas";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return saveReview(request, false);
}

export async function PATCH(request: Request) {
  return saveReview(request, true);
}

async function saveReview(request: Request, updating: boolean) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(`review:${auth.user.id}`, 10, 60 * 60_000);
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = reviewUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const [{ data: reservation }, { data: profile }] = await Promise.all([
    admin
      .from("reservations")
      .select("id, customer_user_id, vendor_id, product_id, status")
      .eq("id", parsed.data.reservationId)
      .maybeSingle(),
    admin.from("profiles").select("full_name, role").eq("id", auth.user.id).maybeSingle(),
  ]);

  if (!reservation || reservation.customer_user_id !== auth.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (reservation.status !== "paid") {
    return NextResponse.json({ error: "not_a_completed_purchase" }, { status: 409 });
  }

  const values = {
    overall_rating: parsed.data.overallRating,
    product_rating: parsed.data.productRating,
    communication_rating: parsed.data.communicationRating,
    fulfilment_rating: parsed.data.fulfilmentRating,
    packaging_rating: parsed.data.packagingRating,
    delivery_rating: parsed.data.deliveryRating,
    title: parsed.data.title ?? null,
    comment: parsed.data.comment ?? null,
  };

  if (updating) {
    const { data: existing } = await admin
      .from("reviews")
      .select("id, customer_user_id, editable_until")
      .eq("reservation_id", reservation.id)
      .maybeSingle();
    if (!existing || existing.customer_user_id !== auth.user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (Date.parse(existing.editable_until) <= Date.now()) {
      return NextResponse.json({ error: "review_window_closed" }, { status: 409 });
    }

    const { error } = await admin.from("reviews").update(values).eq("id", existing.id);
    if (error) return NextResponse.json({ error: "review_update_failed" }, { status: 500 });

    await logAudit({
      actor_user_id: auth.user.id,
      actor_role: profile?.role ?? "customer",
      action: "review.update",
      entity_type: "review",
      entity_id: existing.id,
      new_value: { overall_rating: parsed.data.overallRating },
      ip_address: ipFromRequest(request),
    });
    return NextResponse.json({ id: existing.id, updated: true });
  }

  const { data: duplicate } = await admin
    .from("reviews")
    .select("id")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  if (duplicate) return NextResponse.json({ error: "review_already_exists" }, { status: 409 });

  const { data: review, error } = await admin
    .from("reviews")
    .insert({
      reservation_id: reservation.id,
      customer_user_id: auth.user.id,
      vendor_id: reservation.vendor_id,
      product_id: reservation.product_id,
      customer_display_name: publicDisplayName(profile?.full_name),
      ...values,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "review_already_exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "review_create_failed" }, { status: 500 });
  }

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile?.role ?? "customer",
    action: "review.create",
    entity_type: "review",
    entity_id: review.id,
    new_value: { reservation_id: reservation.id, overall_rating: parsed.data.overallRating },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ id: review.id, created: true }, { status: 201 });
}

function publicDisplayName(fullName: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Verified buyer";
  if (parts.length === 1) return parts[0]!.slice(0, 80);
  return `${parts[0]} ${parts.at(-1)![0]}.`.slice(0, 80);
}

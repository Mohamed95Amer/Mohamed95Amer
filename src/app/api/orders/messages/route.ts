import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { orderMessageSchema } from "@/lib/validation/schemas";
import { notifyUser } from "@/lib/notifications/server";
import { distributedRateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderAccess = {
  id: string;
  customer_user_id: string;
  vendor_id: string;
  status: string;
  expires_at: string;
  vendor_confirmed_price_aed: number | null;
};

async function accessFor(userId: string, reservationId: string) {
  const admin = getServiceSupabase();
  const [{ data: order }, { data: vendor }] = await Promise.all([
    admin
      .from("reservations")
      .select(
        "id, customer_user_id, vendor_id, status, expires_at, vendor_confirmed_price_aed",
      )
      .eq("id", reservationId)
      .maybeSingle(),
    admin
      .from("vendors")
      .select("id, owner_user_id, verification_status")
      .eq("owner_user_id", userId)
      .maybeSingle(),
  ]);
  if (!order) return null;
  const actorRole =
    order.customer_user_id === userId
      ? "customer"
      : vendor?.id === order.vendor_id &&
          vendor?.verification_status === "approved"
        ? "vendor"
        : null;
  return actorRole
    ? {
        order: order as OrderAccess,
        actorRole,
        vendorOwnerId: vendor?.owner_user_id ?? null,
      }
    : null;
}

export async function GET(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reservationId = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("reservationId"));
  if (!reservationId.success)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const access = await accessFor(auth.user.id, reservationId.data);
  if (!access)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = getServiceSupabase();
  const { data, error } = await admin
    .from("order_messages")
    .select(
      "id, reservation_id, sender_user_id, sender_role, message_type, body, payment_url, created_at",
    )
    .eq("reservation_id", reservationId.data)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);
  if (error)
    return NextResponse.json(
      { error: "messages_unavailable" },
      { status: 503 },
    );
  return NextResponse.json(
    { messages: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 10_000) {
    return NextResponse.json({ error: "message_too_large" }, { status: 413 });
  }
  if (!(await distributedRateLimit(`order-message:${auth.user.id}`, 20, 60_000)).ok) {
    return NextResponse.json(
      { error: "Please wait before sending more messages." },
      { status: 429 },
    );
  }
  const parsed = orderMessageSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_input" },
      { status: 400 },
    );
  }
  const access = await accessFor(auth.user.id, parsed.data.reservationId);
  if (!access)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (parsed.data.messageType === "payment_link") {
    const activePaymentWindow =
      access.actorRole === "vendor" &&
      access.order.status === "payment_pending" &&
      access.order.vendor_confirmed_price_aed != null &&
      Date.parse(access.order.expires_at) > Date.now();
    if (!activePaymentWindow) {
      return NextResponse.json(
        {
          error:
            "Payment links unlock only after the customer accepts the confirmed price and while the payment window is active.",
        },
        { status: 409 },
      );
    }
  }
  const admin = getServiceSupabase();
  const { data: message, error } = await admin
    .from("order_messages")
    .insert({
      reservation_id: access.order.id,
      sender_user_id: auth.user.id,
      sender_role: access.actorRole,
      message_type: parsed.data.messageType,
      body: parsed.data.body,
      payment_url:
        parsed.data.messageType === "payment_link"
          ? parsed.data.paymentUrl
          : null,
    })
    .select(
      "id, reservation_id, sender_user_id, sender_role, message_type, body, payment_url, created_at",
    )
    .single();
  if (error || !message)
    return NextResponse.json({ error: "message_not_sent" }, { status: 503 });

  let recipientId = access.order.customer_user_id;
  if (access.actorRole === "customer") {
    const { data: vendor } = await admin
      .from("vendors")
      .select("owner_user_id")
      .eq("id", access.order.vendor_id)
      .single();
    recipientId = vendor?.owner_user_id ?? "";
  }
  await Promise.all([
    recipientId
      ? notifyUser({
          userId: recipientId,
          kind: "order",
          title:
            parsed.data.messageType === "payment_link"
              ? "Your store sent a payment link"
              : `New order message from ${access.actorRole === "vendor" ? "the store" : "the customer"}`,
          body:
            parsed.data.messageType === "payment_link"
              ? "Open the order to review the vendor payment link. Get Gold has not confirmed or received payment."
              : parsed.data.body.slice(0, 180),
          href:
            access.actorRole === "vendor"
              ? `/account/reservations/${access.order.id}#messages`
              : `/vendor/orders/${access.order.id}`,
          dedupeKey: `order-message:${message.id}`,
        })
      : Promise.resolve(),
    parsed.data.messageType === "payment_link"
      ? logAudit({
          actor_user_id: auth.user.id,
          actor_role: "vendor",
          action: "reservation.payment_link_sent",
          entity_type: "reservation",
          entity_id: access.order.id,
          new_value: {
            message_id: message.id,
            payment_host: new URL(parsed.data.paymentUrl!).hostname,
          },
          ip_address: ipFromRequest(request),
        })
      : Promise.resolve(),
  ]);
  return NextResponse.json({ message }, { status: 201 });
}

import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { buyerRequestAcceptOfferSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications/server";
import { trackServerEvent } from "@/lib/analytics/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcceptedOfferResult = { id: string; status: string };

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = buyerRequestAcceptOfferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: rawData, error } = await admin.rpc("accept_buyer_request_offer", {
    p_customer_user_id: auth.user.id,
    p_offer_id: parsed.data.offerId,
  }).single();
  const data = rawData as AcceptedOfferResult | null;
  if (error || !data) {
    const status = error?.message.includes("not_") ? 409 : 500;
    return NextResponse.json({ error: error?.message ?? "accept_failed" }, { status });
  }
  await logAudit({ actor_user_id: auth.user.id, actor_role: "customer", action: "buyer_request.offer_accepted", entity_type: "buyer_request_offer", entity_id: parsed.data.offerId, ip_address: ipFromRequest(request) });
  const { data: offer } = await admin.from("buyer_request_offers").select("vendor:vendors(owner_user_id), product_id").eq("id", parsed.data.offerId).maybeSingle();
  const rawVendor = offer?.vendor as unknown as { owner_user_id: string } | Array<{ owner_user_id: string }> | null;
  const vendor = Array.isArray(rawVendor) ? rawVendor[0] : rawVendor;
  if (vendor?.owner_user_id) await notifyUser({ userId: vendor.owner_user_id, kind: "offer", title: "Your offer was accepted", body: offer?.product_id ? "The buyer can now continue to the linked listing and place the order." : "Contact the buyer through the approved request workflow to confirm the custom item next step.", href: "/vendor/requests", dedupeKey: `offer-accepted:${parsed.data.offerId}` });
  await trackServerEvent({ eventName: "offer_accepted", userId: auth.user.id, productId: offer?.product_id ?? null });
  return NextResponse.json({ id: data.id, status: data.status });
}

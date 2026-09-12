import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { buyerRequestAcceptOfferSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

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
  return NextResponse.json({ id: data.id, status: data.status });
}

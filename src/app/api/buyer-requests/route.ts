import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { buyerRequestCreateSchema } from "@/lib/validation/schemas";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { dubaiTodayIso } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`buyer-request:${auth.user.id}`, 5, 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const parsed = buyerRequestCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.referenceImagePath && !parsed.data.referenceImagePath.startsWith(`${auth.user.id}/`)) {
    return NextResponse.json({ error: "invalid_image_reference" }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "customer") return NextResponse.json({ error: "customer_account_required" }, { status: 403 });

  const { data, error } = await admin.from("buyer_requests").insert({
    customer_user_id: auth.user.id,
    category: parsed.data.category,
    karat: parsed.data.karat,
    budget_min_aed: parsed.data.budgetMinAed,
    budget_max_aed: parsed.data.budgetMaxAed,
    emirate: parsed.data.emirate,
    needed_by: parsed.data.neededBy || null,
    description: parsed.data.description,
    reference_image_path: parsed.data.referenceImagePath || null,
  }).select("id").single();
  if (error || !data) {
    if (parsed.data.referenceImagePath) await admin.storage.from("buyer-request-images").remove([parsed.data.referenceImagePath]);
    return NextResponse.json({ error: error?.message ?? "create_failed" }, { status: 500 });
  }

  await logAudit({ actor_user_id: auth.user.id, actor_role: "customer", action: "buyer_request.created", entity_type: "buyer_request", entity_id: data.id, ip_address: ipFromRequest(request) });
  const { data: vendors } = await admin.from("vendors").select("owner_user_id").eq("verification_status", "approved").eq("emirate", parsed.data.emirate).gte("license_expiry_date", dubaiTodayIso()).limit(50);
  await Promise.all([
    ...(vendors ?? []).map((vendor) => notifyUser({ userId: vendor.owner_user_id, kind: "offer", title: `New ${parsed.data.karat}K ${parsed.data.category} request`, body: `A buyer in ${parsed.data.emirate} is asking verified stores for an offer.`, href: "/vendor/requests", dedupeKey: `buyer-request:${data.id}:${vendor.owner_user_id}` })),
    trackServerEvent({ eventName: "buyer_request_created", userId: auth.user.id, metadata: { category: parsed.data.category, karat: parsed.data.karat, emirate: parsed.data.emirate } }),
  ]);
  return NextResponse.json({ id: data.id });
}

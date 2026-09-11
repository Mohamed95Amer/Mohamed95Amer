import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sumsubLevelForRoute, verifySumsubWebhookDigest, type IdentityVerificationRoute } from "@/lib/identity/sumsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SumsubWebhook {
  type?: string;
  applicantId?: string;
  externalUserId?: string;
  levelName?: string;
  reviewStatus?: string;
  reviewResult?: {
    reviewAnswer?: string;
    reviewRejectType?: string;
  };
}

export async function POST(request: Request) {
  if (!env.sumsubWebhookSecret()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const rawBody = await request.text();
  const digest = request.headers.get("x-payload-digest") ?? "";
  const algorithm = request.headers.get("x-payload-digest-alg") ?? "";
  if (!verifySumsubWebhookDigest({ rawBody, digest, algorithm })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: SumsubWebhook;
  try {
    payload = JSON.parse(rawBody) as SumsubWebhook;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!payload.externalUserId) return new NextResponse(null, { status: 204 });

  const admin = getServiceSupabase();
  const { data: verification } = await admin
    .from("order_identity_verifications")
    .select("id, verification_route, status")
    .eq("provider_external_user_id", payload.externalUserId)
    .maybeSingle();
  if (!verification || verification.status === "consumed") return new NextResponse(null, { status: 204 });

  const expectedLevel = sumsubLevelForRoute(verification.verification_route as IdentityVerificationRoute);
  if (payload.levelName && payload.levelName !== expectedLevel) {
    await admin
      .from("order_identity_verifications")
      .update({ status: "error", result_code: "unexpected_verification_level" })
      .eq("id", verification.id);
    return new NextResponse(null, { status: 204 });
  }

  const update: Record<string, string | null> = {
    provider_applicant_id: payload.applicantId ?? null,
  };
  if (payload.type === "applicantPending") {
    update.status = "in_review";
  } else if (payload.type === "applicantReviewed") {
    const approved = payload.reviewResult?.reviewAnswer === "GREEN";
    update.status = approved ? "approved" : "rejected";
    update.verified_at = approved ? new Date().toISOString() : null;
    update.result_code = approved ? "GREEN" : payload.reviewResult?.reviewRejectType ?? "RED";
  } else {
    return new NextResponse(null, { status: 204 });
  }

  await admin
    .from("order_identity_verifications")
    .update(update)
    .eq("id", verification.id)
    .neq("status", "consumed");
  return new NextResponse(null, { status: 204 });
}

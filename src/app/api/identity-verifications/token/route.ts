import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { identityVerificationTokenSchema } from "@/lib/validation/schemas";
import { createSumsubSdkToken, sumsubIsConfigured, type IdentityVerificationRoute } from "@/lib/identity/sumsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!sumsubIsConfigured()) return NextResponse.json({ error: "identity_provider_not_configured" }, { status: 503 });

  const payload = await request.json().catch(() => null);
  const parsed = identityVerificationTokenSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: verification } = await admin
    .from("order_identity_verifications")
    .select("provider_external_user_id, verification_route, status, expires_at")
    .eq("id", parsed.data.verificationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!verification || ["consumed", "rejected", "expired"].includes(verification.status)) {
    return NextResponse.json({ error: "verification_unavailable" }, { status: 409 });
  }
  if (Date.parse(verification.expires_at) <= Date.now()) {
    await admin.from("order_identity_verifications").update({ status: "expired" }).eq("id", parsed.data.verificationId);
    return NextResponse.json({ error: "verification_expired" }, { status: 409 });
  }

  try {
    const accessToken = await createSumsubSdkToken({
      externalUserId: verification.provider_external_user_id,
      route: verification.verification_route as IdentityVerificationRoute,
    });
    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json({ error: "identity_provider_unavailable" }, { status: 502 });
  }
}

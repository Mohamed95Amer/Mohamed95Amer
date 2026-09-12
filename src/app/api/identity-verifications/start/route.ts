import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { identityVerificationStartSchema } from "@/lib/validation/schemas";
import { createDiditVerificationSession, diditIsConfigured } from "@/lib/identity/didit";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = rateLimit(`identity:${auth.user.id}`, 3, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited", message: "Please wait before starting another identity check." }, { status: 429 });

  const payload = await request.json().catch(() => null);
  const parsed = identityVerificationStartSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (!diditIsConfigured()) {
    return NextResponse.json(
      {
        error: "identity_provider_not_configured",
        message: "Mandatory identity verification is being configured. Orders are temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const admin = getServiceSupabase();
  const { data: product } = await admin
    .from("products")
    .select("id")
    .eq("id", parsed.data.productId)
    .eq("product_status", "approved")
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "product_unavailable" }, { status: 400 });

  const verificationId = randomUUID();
  const externalUserId = `getgold-order-${verificationId}`;
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { error: insertError } = await admin.from("order_identity_verifications").insert({
    id: verificationId,
    user_id: auth.user.id,
    product_id: product.id,
    verification_route: parsed.data.verificationRoute,
    provider: "didit",
    provider_external_user_id: externalUserId,
    status: "pending",
    expires_at: expiresAt,
  });
  if (insertError) return NextResponse.json({ error: "verification_start_failed" }, { status: 500 });

  try {
    const session = await createDiditVerificationSession({
      verificationId,
      productId: product.id,
      route: parsed.data.verificationRoute,
    });
    const { error: sessionUpdateError } = await admin
      .from("order_identity_verifications")
      .update({ provider_applicant_id: session.sessionId })
      .eq("id", verificationId);
    if (sessionUpdateError) throw sessionUpdateError;
    return NextResponse.json({
      verificationId,
      verificationUrl: session.verificationUrl,
      expiresAt,
    });
  } catch {
    await admin
      .from("order_identity_verifications")
      .update({ status: "error", result_code: "provider_start_failed" })
      .eq("id", verificationId);
    return NextResponse.json(
      { error: "identity_provider_unavailable", message: "Identity verification could not start. Please try again." },
      { status: 502 },
    );
  }
}

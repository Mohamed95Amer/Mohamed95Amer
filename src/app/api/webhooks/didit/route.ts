import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  diditWorkflowForRoute,
  diditConfigurationIsSafe,
  diditEnvironmentMatches,
  mapDiditStatus,
  verifyDiditWebhookSignature,
  type IdentityVerificationRoute,
} from "@/lib/identity/didit";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const webhookSchema = z.object({
  webhook_type: z.string().optional(),
  session_kind: z.string().optional(),
  session_id: z.string().optional(),
  vendor_data: z.string().nullable().optional(),
  workflow_id: z.string().optional(),
  status: z.string().optional(),
  timestamp: z.number().int(),
  environment: z.enum(["sandbox", "live"]),
}).passthrough();

export async function POST(request: Request) {
  if (!env.diditWebhookSecret() || !diditConfigurationIsSafe()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const payload = parsed.data;

  const timestamp = request.headers.get("x-timestamp") ?? "";
  if (
    payload.timestamp?.toString() !== timestamp
    || !verifyDiditWebhookSignature({
      rawBody,
      parsedBody: payload,
      signatureV2: request.headers.get("x-signature-v2") ?? "",
      rawSignature: request.headers.get("x-signature") ?? "",
      timestamp,
    })
  ) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (!diditEnvironmentMatches(payload.environment)) {
    return NextResponse.json({ error: "unexpected_environment" }, { status: 400 });
  }

  if (
    !["status.updated", "data.updated"].includes(payload.webhook_type ?? "")
    || payload.session_kind === "business"
    || !payload.session_id
  ) {
    return new NextResponse(null, { status: 204 });
  }

  const admin = getServiceSupabase();
  const { data: verification, error: lookupError } = await admin
    .from("order_identity_verifications")
    .select("id, provider_external_user_id, verification_route, status")
    .eq("provider", "didit")
    .eq("provider_applicant_id", payload.session_id)
    .maybeSingle();
  // Acknowledge only successful reads/writes so Didit can retry outages.
  if (lookupError) return NextResponse.json({ error: "verification_read_failed" }, { status: 503 });
  if (!verification || verification.status === "consumed") {
    return new NextResponse(null, { status: 204 });
  }

  const expectedWorkflow = diditWorkflowForRoute(
    verification.verification_route as IdentityVerificationRoute,
  );
  if (
    payload.workflow_id !== expectedWorkflow
    || payload.vendor_data !== verification.provider_external_user_id
  ) {
    const { error } = await admin
      .from("order_identity_verifications")
      .update({ status: "error", result_code: "UNEXPECTED_PROVIDER_SESSION", verified_at: null })
      .eq("id", verification.id)
      .neq("status", "consumed");
    if (error) return NextResponse.json({ error: "verification_update_failed" }, { status: 503 });
    return new NextResponse(null, { status: 204 });
  }

  const mapped = mapDiditStatus(payload.status);
  const { error } = await admin
    .from("order_identity_verifications")
    .update({
      status: mapped.status,
      result_code: mapped.resultCode,
      verified_at: mapped.status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", verification.id)
    .neq("status", "consumed")
    .gt("expires_at", new Date().toISOString());

  if (error) return NextResponse.json({ error: "verification_update_failed" }, { status: 503 });

  return new NextResponse(null, { status: 204 });
}

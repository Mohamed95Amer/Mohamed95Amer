import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  diditWorkflowForRoute,
  mapDiditStatus,
  verifyDiditWebhookSignature,
  type IdentityVerificationRoute,
} from "@/lib/identity/didit";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DiditWebhook {
  webhook_type?: string;
  session_kind?: string;
  session_id?: string;
  vendor_data?: string;
  workflow_id?: string;
  status?: string;
  timestamp?: number;
}

export async function POST(request: Request) {
  if (!env.diditWebhookSecret()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  let payload: DiditWebhook;
  try {
    payload = JSON.parse(rawBody) as DiditWebhook;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

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

  if (
    !["status.updated", "data.updated"].includes(payload.webhook_type ?? "")
    || payload.session_kind === "business"
    || !payload.session_id
  ) {
    return new NextResponse(null, { status: 204 });
  }

  const admin = getServiceSupabase();
  const { data: verification } = await admin
    .from("order_identity_verifications")
    .select("id, provider_external_user_id, verification_route, status")
    .eq("provider", "didit")
    .eq("provider_applicant_id", payload.session_id)
    .maybeSingle();
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
    await admin
      .from("order_identity_verifications")
      .update({ status: "error", result_code: "UNEXPECTED_PROVIDER_SESSION", verified_at: null })
      .eq("id", verification.id)
      .neq("status", "consumed");
    return new NextResponse(null, { status: 204 });
  }

  const mapped = mapDiditStatus(payload.status);
  await admin
    .from("order_identity_verifications")
    .update({
      status: mapped.status,
      result_code: mapped.resultCode,
      verified_at: mapped.status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", verification.id)
    .neq("status", "consumed");

  return new NextResponse(null, { status: 204 });
}

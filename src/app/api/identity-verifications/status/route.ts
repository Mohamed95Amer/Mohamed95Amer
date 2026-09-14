import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import {
  diditWorkflowForRoute,
  mapDiditStatus,
  retrieveDiditDecision,
  type IdentityVerificationRoute,
} from "@/lib/identity/didit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().uuid();

export async function GET(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  const parsed = querySchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: verification } = await admin
    .from("order_identity_verifications")
    .select("status, expires_at, provider, provider_external_user_id, provider_applicant_id, verification_route")
    .eq("id", parsed.data)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!verification) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!["consumed", "rejected", "expired"].includes(verification.status) && Date.parse(verification.expires_at) <= Date.now()) {
    await admin.from("order_identity_verifications").update({ status: "expired" }).eq("id", parsed.data).neq("status", "consumed");
    return NextResponse.json({ status: "expired" });
  }

  if (
    verification.provider === "didit"
    && verification.provider_applicant_id
    && ["pending", "in_review"].includes(verification.status)
  ) {
    try {
      const decision = await retrieveDiditDecision(verification.provider_applicant_id);
      const expectedWorkflow = diditWorkflowForRoute(verification.verification_route as IdentityVerificationRoute);
      const identityMatches = decision.session_id === verification.provider_applicant_id
        && decision.vendor_data === verification.provider_external_user_id
        && decision.workflow_id === expectedWorkflow;
      const mapped = identityMatches
        ? mapDiditStatus(decision.status)
        : { status: "error" as const, resultCode: "UNEXPECTED_PROVIDER_SESSION" };
      const update = {
        status: mapped.status,
        result_code: mapped.resultCode,
        verified_at: mapped.status === "approved" ? new Date().toISOString() : null,
      };
      const { data: updated, error: updateError } = await admin
        .from("order_identity_verifications")
        .update(update)
        .eq("id", parsed.data)
        .in("status", ["pending", "in_review"])
        .gt("expires_at", new Date().toISOString())
        .select("status")
        .maybeSingle();
      // A competing webhook/stock claim can make this update affect zero rows.
      // Never report an approval that was not actually persisted.
      if (!updateError && updated) return NextResponse.json({ status: updated.status });
    } catch {
      // A temporary provider-read failure must not approve or reject the user.
      // Keep the local pending state so webhook delivery or the next poll can recover.
    }
  }
  return NextResponse.json({ status: verification.status });
}

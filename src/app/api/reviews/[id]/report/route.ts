import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { reviewReportSchema } from "@/lib/validation/schemas";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(`review-report:${auth.user.id}`, 10, 24 * 60 * 60_000);
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = reviewReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const [{ data: review }, { data: profile }] = await Promise.all([
    admin.from("reviews").select("id, customer_user_id, moderation_status").eq("id", params.id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!review || review.moderation_status !== "published") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (review.customer_user_id === auth.user.id) {
    return NextResponse.json({ error: "cannot_report_own_review" }, { status: 409 });
  }

  const { data: report, error } = await admin
    .from("review_reports")
    .insert({
      review_id: review.id,
      reporter_user_id: auth.user.id,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "already_reported" }, { status: 409 });
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile?.role ?? "customer",
    action: "review.report",
    entity_type: "review_report",
    entity_id: report.id,
    new_value: { review_id: review.id, reason: parsed.data.reason },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ id: report.id }, { status: 201 });
}

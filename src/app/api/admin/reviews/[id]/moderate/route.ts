import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { adminReviewModerationSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminReviewModerationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const now = new Date().toISOString();
  const action = parsed.data.action;
  let error: { message: string } | null = null;

  if (action === "publish_review" || action === "hide_review") {
    ({ error } = await admin.from("reviews").update({
      moderation_status: action === "publish_review" ? "published" : "hidden",
      moderation_note: parsed.data.note ?? null,
      moderated_by: auth.user.id,
      moderated_at: now,
    }).eq("id", params.id));
  } else if (action === "publish_reply" || action === "hide_reply") {
    ({ error } = await admin.from("reviews").update({
      vendor_reply_status: action === "publish_reply" ? "published" : "hidden",
      moderation_note: parsed.data.note ?? null,
      moderated_by: auth.user.id,
      moderated_at: now,
    }).eq("id", params.id));
  } else {
    if (!parsed.data.reportId) return NextResponse.json({ error: "report_id_required" }, { status: 400 });
    ({ error } = await admin.from("review_reports").update({
      status: action === "dismiss_report" ? "dismissed" : "actioned",
      resolution_note: parsed.data.note ?? null,
      resolved_by: auth.user.id,
      resolved_at: now,
    }).eq("id", parsed.data.reportId).eq("review_id", params.id));

    if (!error && action === "action_report") {
      ({ error } = await admin.from("reviews").update({
        moderation_status: "hidden",
        moderation_note: parsed.data.note ?? "Hidden after an upheld report",
        moderated_by: auth.user.id,
        moderated_at: now,
      }).eq("id", params.id));
    }
  }

  if (error) return NextResponse.json({ error: "moderation_failed" }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile.role,
    action: `review.${action}`,
    entity_type: "review",
    entity_id: params.id,
    new_value: { report_id: parsed.data.reportId ?? null, note: parsed.data.note ?? null },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ ok: true });
}

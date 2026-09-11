import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { vendorReviewReplySchema } from "@/lib/validation/schemas";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(`review-reply:${auth.user.id}`, 20, 60 * 60_000);
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = vendorReviewReplySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).maybeSingle();
  if (!vendor) return NextResponse.json({ error: "no_vendor" }, { status: 403 });

  const { data: review } = await admin
    .from("reviews")
    .select("id, vendor_id, vendor_reply, moderation_status")
    .eq("id", params.id)
    .maybeSingle();
  if (!review || review.vendor_id !== vendor.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (review.moderation_status !== "published") {
    return NextResponse.json({ error: "review_not_public" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, string> = {
    vendor_reply: parsed.data.reply,
    vendor_reply_updated_at: now,
  };
  if (!review.vendor_reply) updates.vendor_replied_at = now;

  const { error } = await admin
    .from("reviews")
    .update(updates)
    .eq("id", review.id);
  if (error) return NextResponse.json({ error: "reply_failed" }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: review.vendor_reply ? "review.reply_update" : "review.reply_create",
    entity_type: "review",
    entity_id: review.id,
    new_value: { has_reply: true },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ id: review.id, updated: Boolean(review.vendor_reply) });
}

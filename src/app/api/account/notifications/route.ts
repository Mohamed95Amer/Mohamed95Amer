import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
const schema = z
  .object({
    id: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => [v.id, v.campaignId, v.all].filter(Boolean).length === 1);
export async function POST(request: Request) {
  const {
    data: { user },
  } = await (await getServerSupabase()).auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const db = getServiceSupabase(),
    now = new Date().toISOString();
  const { id, campaignId, all } = parsed.data;
  if (campaignId || all) {
    const result = await db.rpc("customer_campaign_inbox", {
      p_user_id: user.id,
    });
    if (result.error)
      return NextResponse.json(
        { error: "Could not load eligible notifications" },
        { status: 500 },
      );
    const eligible = (result.data ?? []) as {
      id: string;
      read_at: string | null;
    }[];
    if (campaignId && !eligible.some((c) => c.id === campaignId))
      return NextResponse.json(
        { error: "Notification not available" },
        { status: 404 },
      );
    const rows = eligible
      .filter((c) => !c.read_at && (!campaignId || c.id === campaignId))
      .map((c) => ({ campaign_id: c.id, user_id: user.id, read_at: now }));
    if (rows.length) {
      const { error } = await db
        .from("notification_campaign_reads")
        .upsert(rows, {
          onConflict: "campaign_id,user_id",
          ignoreDuplicates: true,
        });
      if (error)
        return NextResponse.json(
          { error: "Could not mark promotions read" },
          { status: 500 },
        );
    }
  }
  if (id || all) {
    let query = db
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null)
      .lte("available_at", now);
    if (id) query = query.eq("id", id);
    const { error } = await query;
    if (error)
      return NextResponse.json(
        { error: "Could not mark notifications read" },
        { status: 500 },
      );
  }
  return NextResponse.json({ ok: true });
}

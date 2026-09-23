import { NextResponse } from "next/server";
import { z } from "zod";
import { adminContext } from "@/lib/admin/context";
import { campaignSchema } from "@/lib/notifications/campaigns";
const schema = z.object({
  id: z.string().uuid(),
  action: z.enum(["create", "update", "publish", "cancel"]),
  values: campaignSchema.optional(),
});
export async function POST(request: Request) {
  const ctx = await adminContext();
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the message, local link and dates (maximum 90 days)." },
      { status: 400 },
    );
  const { action, id, values } = parsed.data;
  if (
    ["create", "update"].includes(action) &&
    (!values || Date.parse(values.ends_at) <= Date.now())
  )
    return NextResponse.json(
      { error: "A complete draft with a future end date is required." },
      { status: 400 },
    );
  const { error } = await ctx.db.rpc("manage_notification_campaign", {
    p_actor: ctx.user.id,
    p_action: action,
    p_id: id,
    p_values: values ?? {},
  });
  if (error) {
    console.error("Campaign mutation failed", error.code);
    return NextResponse.json(
      {
        error:
          "The campaign changed or could not be saved. Refresh before retrying.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

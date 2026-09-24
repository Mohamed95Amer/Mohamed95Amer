import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({ hours: z.array(z.object({
  day_of_week: z.number().int().min(0).max(6),
  is_open: z.boolean(),
  opens_at: time,
  closes_at: time,
})).length(7) }).superRefine(({ hours }, ctx) => {
  if (new Set(hours.map((row) => row.day_of_week)).size !== 7) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include every day exactly once." });
  if (!hours.some((row) => row.is_open)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Keep at least one working day open." });
  hours.forEach((row, index) => { if (row.is_open && row.opens_at >= row.closes_at) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hours", index, "closes_at"], message: "Closing time must be after opening time." }); });
});

export async function POST(request: Request) {
  const client = await getServerSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_hours" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).eq("verification_status", "approved").maybeSingle();
  if (!vendor) return NextResponse.json({ error: "approved_vendor_required" }, { status: 403 });
  const rows = parsed.data.hours.map((row) => ({ vendor_id: vendor.id, ...row, updated_at: new Date().toISOString() }));
  const { error } = await admin.from("vendor_working_hours").upsert(rows, { onConflict: "vendor_id,day_of_week" });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "vendor.working_hours_updated", entity_type: "vendor", entity_id: vendor.id, new_value: { hours: parsed.data.hours } });
  return NextResponse.json({ saved: true });
}

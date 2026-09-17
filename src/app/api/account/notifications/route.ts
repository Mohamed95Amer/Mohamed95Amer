import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() })
  .refine((value) => Boolean(value.id) !== Boolean(value.all), "Choose one notification or all");

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  let query = getServiceSupabase().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", auth.user.id).is("read_at", null);
  if (parsed.data.id) query = query.eq("id", parsed.data.id);
  const { error } = await query;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}


import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({ language: z.enum(["en", "ar"]) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const userClient = await getServerSupabase(); const { data: auth } = await userClient.auth.getUser();
  if (auth.user) await getServiceSupabase().from("user_preferences").upsert({ user_id: auth.user.id, language: parsed.data.language }, { onConflict: "user_id" });
  const response = NextResponse.json({ language: parsed.data.language }); response.cookies.set("gg_lang", parsed.data.language, { sameSite: "lax", maxAge: 31_536_000, path: "/" }); return response;
}


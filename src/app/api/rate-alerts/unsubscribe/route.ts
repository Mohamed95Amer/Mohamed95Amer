import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const token = z.string().uuid();

async function unsubscribe(request: Request) {
  const url = new URL(request.url);
  const parsed = token.safeParse(url.searchParams.get("token"));
  let locale = "en";
  if (parsed.success) {
    const { data } = await getServiceSupabase()
      .from("rate_alert_subscriptions")
      .update({ active: false, unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("unsubscribe_token", parsed.data)
      .select("locale")
      .maybeSingle();
    if (data?.locale === "ar") locale = "ar";
  }
  return locale;
}

/** Link in the email footer. */
export async function GET(request: Request) {
  const locale = await unsubscribe(request);
  return NextResponse.redirect(new URL(`/gold-rate/unsubscribed${locale === "ar" ? "?lang=ar" : ""}`, request.url), 303);
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
export async function POST(request: Request) {
  await unsubscribe(request);
  return NextResponse.json({ ok: true });
}

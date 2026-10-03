import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { notificationPreferencesSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = notificationPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { data, error } = await getServiceSupabase().from("user_preferences").upsert({
    user_id: auth.user.id,
    language: parsed.data.language,
    // Operational account records remain available even when every external
    // channel is off; the UI never pretends an order update was delivered elsewhere.
    in_app_notifications: true,
    email_notifications: parsed.data.emailNotifications,
    sms_notifications: parsed.data.smsNotifications,
    whatsapp_notifications: parsed.data.whatsappNotifications,
    marketing_notifications: parsed.data.marketingNotifications,
  }, { onConflict: "user_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const response = NextResponse.json({ preferences: data });
  response.cookies.set("gg_lang", data.language, { sameSite: "lax", maxAge: 31_536_000, path: "/" });
  return response;
}

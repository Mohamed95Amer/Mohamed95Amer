import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { distributedRateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { normalizeWhatsapp, rateAlertSchema } from "@/lib/gold-rate/subscriptions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = await distributedRateLimit(`rate-alert:${ipFromRequest(request)}`, 6, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = rateAlertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;
  // Honeypot: real visitors never fill the hidden field. Answer as if saved.
  if (input.website) return NextResponse.json({ ok: true });
  const now = new Date().toISOString();
  const { error } = await getServiceSupabase().from("rate_alert_subscriptions").upsert({
    email: input.email,
    whatsapp: normalizeWhatsapp(input.whatsapp),
    karat: input.karat,
    frequency: input.frequency,
    target_rate_aed: input.targetRateAed ?? null,
    locale: input.locale,
    source_path: input.sourcePath?.startsWith("/") ? input.sourcePath : null,
    consent_at: now,
    active: true,
    unsubscribed_at: null,
    updated_at: now,
  }, { onConflict: "email,karat" });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

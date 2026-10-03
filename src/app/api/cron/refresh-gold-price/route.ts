import { NextResponse } from "next/server";
import { refreshGoldPrice } from "@/lib/gold-price/service";
import { isAuthorizedCron } from "@/lib/security/cron";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Refresh the live gold price once per invocation.
 *
 * This is a floor, not the main path. Vercel's Hobby plan only permits daily
 * crons, so `/api/gold-price/latest` refreshes on read whenever the newest
 * tick is stale — that is what keeps pricing live under real traffic. This
 * endpoint guarantees a tick exists even during a quiet period, and gives an
 * external scheduler (cron-job.org, GitHub Actions) something to call more
 * often if you want proactive updates.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}  OR  x-cron-secret: ${CRON_SECRET}
 */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await refreshGoldPrice();
    if (!outcome.ok || outcome.tick?.status !== "ok") {
      await logWarning(outcome);
    }
    return NextResponse.json({
      ok: outcome.ok,
      status: outcome.tick?.status ?? "failed",
      price_per_gram_24k_aed: outcome.tick?.price_per_gram_24k_aed ?? null,
      source: outcome.tick?.source ?? null,
      attempts: outcome.attempts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function logWarning(outcome: Awaited<ReturnType<typeof refreshGoldPrice>>) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_logs").insert({
      actor_user_id: null,
      actor_role: null,
      action: outcome.ok ? "gold_price.degraded" : "gold_price.failed",
      entity_type: "gold_price_tick",
      entity_id: outcome.tick ? String(outcome.tick.id) : null,
      new_value: { attempts: outcome.attempts, tick: outcome.tick },
      ip_address: null,
    });
  } catch {
    // best-effort; never block the cron
  }
}

import { NextResponse } from "next/server";
import { refreshGoldPrice } from "@/lib/gold-price/service";
import { isAuthorizedCron } from "@/lib/security/cron";
import { env } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh the live gold price. Designed to be called every minute by a cron
 * (Vercel Cron, Supabase Edge cron, GitHub Actions, etc.). To approximate
 * the 15–30s refresh cadence on a minute-granularity cron, the endpoint
 * performs N evenly-spaced refreshes within a single call.
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
  const target = clamp(env.refreshIntervalSeconds(), 15, 60);
  const ticksThisMinute = Math.max(1, Math.min(4, Math.floor(60 / target)));
  const gapMs = Math.floor(60_000 / ticksThisMinute);

  const outcomes = [];
  for (let i = 0; i < ticksThisMinute; i++) {
    try {
      const outcome = await refreshGoldPrice();
      outcomes.push({ index: i, ok: outcome.ok, attempts: outcome.attempts });
      // Log degraded/failed ticks for admin visibility
      if (!outcome.ok || outcome.tick?.status !== "ok") {
        await logWarning(outcome);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({ index: i, ok: false, error: message });
    }
    if (i < ticksThisMinute - 1) {
      await sleep(gapMs);
    }
  }
  return NextResponse.json({ refreshedCount: outcomes.length, outcomes });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

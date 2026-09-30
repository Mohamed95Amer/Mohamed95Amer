import { NextResponse } from "next/server";
import { getLatestTick, isFresh } from "@/lib/gold-price/service";
import { refreshInBand } from "@/lib/gold-price/refresh-on-read";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreHeaders(source: string) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-GoldHub-Quote-Source": source,
  };
}

/**
 * Public endpoint. Returns the latest usable gold price tick plus a derived
 * `isFresh` flag based on the configured stale window. Never cached.
 *
 * Vercel's Hobby plan only allows daily crons, so this endpoint refreshes the
 * price itself whenever the newest tick has gone stale. That keeps pricing
 * live off ordinary traffic; the cron is just a floor for quiet periods.
 * Refreshes are single-flighted so a burst of visitors costs one upstream call.
 */
export async function GET() {
  try {
    const staleAfterSeconds = env.stalePriceSeconds();
    const refreshIntervalSeconds = env.refreshIntervalSeconds();
    let tick = await getLatestTick();

    // Refresh on the display cadence, not the stale threshold: waiting for the
    // quote to go stale would mean the price only visibly moved once a minute.
    if (!tick || !isFresh(tick.fetched_at, refreshIntervalSeconds)) {
      await refreshInBand();
      // Re-read: refreshInBand swallows upstream failures, so this may still
      // return the previous tick. That is intentional — a stale price beats none.
      tick = (await getLatestTick()) ?? tick;
    }

    if (!tick) {
      return NextResponse.json(
        { tick: null, isFresh: false, staleAfterSeconds, refreshIntervalSeconds },
        { status: 200, headers: noStoreHeaders("unavailable") },
      );
    }

    return NextResponse.json(
      {
        tick: {
          id: tick.id,
          source: tick.source,
          xau_usd: tick.xau_usd,
          usd_aed: tick.usd_aed,
          price_per_gram_24k_aed: tick.price_per_gram_24k_aed,
          fetched_at: tick.fetched_at,
          status: tick.status,
        },
        isFresh: isFresh(tick.fetched_at, staleAfterSeconds),
        staleAfterSeconds,
        refreshIntervalSeconds,
      },
      { status: 200, headers: noStoreHeaders(tick.source) },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: noStoreHeaders("error") });
  }
}

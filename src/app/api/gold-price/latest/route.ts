import { NextResponse } from "next/server";
import { getLatestTick, isFresh } from "@/lib/gold-price/service";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public endpoint. Returns the latest usable gold price tick plus
 * a derived `isFresh` flag based on the configured stale window.
 * Never cached.
 */
export async function GET() {
  try {
    const tick = await getLatestTick();
    if (!tick) {
      return NextResponse.json(
        { tick: null, isFresh: false, staleAfterSeconds: env.stalePriceSeconds() },
        { status: 200, headers: { "Cache-Control": "no-store" } },
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
        isFresh: isFresh(tick.fetched_at, env.stalePriceSeconds()),
        staleAfterSeconds: env.stalePriceSeconds(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

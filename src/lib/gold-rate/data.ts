import { getLatestTick, isFresh } from "@/lib/gold-price/service";
import { refreshInBand } from "@/lib/gold-price/refresh-on-read";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { DailyClose } from "./core";

export interface RateSnapshot {
  price24k: number;
  fetchedAt: string | null;
  /** UTC day of the quote, matching gold_price_daily_history.recorded_on. */
  today: string;
  history: DailyClose[];
}

/** Rate pages tolerate a few minutes of age; the client badge stays live. */
const PAGE_REFRESH_SECONDS = 300;

export async function loadRateSnapshot(days = 40): Promise<RateSnapshot> {
  let tick = await getLatestTick().catch(() => null);
  if (!tick || !isFresh(tick.fetched_at, PAGE_REFRESH_SECONDS)) {
    await refreshInBand().catch(() => undefined);
    tick = (await getLatestTick().catch(() => null)) ?? tick;
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await getServiceSupabase()
    .from("gold_price_daily_history")
    .select("recorded_on, open_price_aed, high_price_aed, low_price_aed, close_price_aed")
    .gte("recorded_on", since)
    .order("recorded_on", { ascending: true });
  const history: DailyClose[] = (data ?? []).map((row) => ({
    day: String(row.recorded_on),
    open: Number(row.open_price_aed),
    high: Number(row.high_price_aed),
    low: Number(row.low_price_aed),
    close: Number(row.close_price_aed),
  }));
  const price24k = Number(tick?.price_per_gram_24k_aed ?? history.at(-1)?.close ?? 0);
  const fetchedAt = tick?.fetched_at ?? null;
  const today = (fetchedAt ? new Date(fetchedAt) : new Date()).toISOString().slice(0, 10);
  return { price24k, fetchedAt, today, history };
}

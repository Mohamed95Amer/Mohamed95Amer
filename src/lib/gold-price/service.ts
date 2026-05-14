import { env } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getProvider } from "./providers";
import { GoldPriceFetchError, type GoldPriceQuote } from "./types";

export interface RefreshOutcome {
  ok: boolean;
  tick: {
    id: number;
    source: string;
    xau_usd: number | null;
    usd_aed: number;
    price_per_gram_24k_aed: number | null;
    fetched_at: string;
    status: "ok" | "degraded" | "failed";
    error_message: string | null;
  } | null;
  attempts: Array<{ provider: string; ok: boolean; error?: string }>;
}

/**
 * Refresh the live gold price.
 *  1. Try the primary provider.
 *  2. On any failure, fall back to the backup provider; persist as 'degraded'.
 *  3. If both fail, persist a 'failed' tick with the error so admin can see it.
 *
 * Sanity-check against the previous tick: if the new price moved by >10% in
 * one tick we mark the tick as 'degraded' rather than 'ok' so the freshness
 * gate keeps order buttons enabled but admins are alerted.
 */
export async function refreshGoldPrice(): Promise<RefreshOutcome> {
  const supabase = getServiceSupabase();
  const usdAed = env.usdAedRate();
  const primary = env.primaryProvider();
  const backup = env.backupProvider();

  const attempts: RefreshOutcome["attempts"] = [];
  let quote: GoldPriceQuote | null = null;
  let degraded = false;
  let lastError = "";

  for (const providerId of [primary, backup]) {
    try {
      const provider = getProvider(providerId);
      const result = await provider.fetch({ usdAed });
      attempts.push({ provider: providerId, ok: true });
      quote = result;
      // If we had to fall back to the backup, mark degraded.
      if (providerId !== primary) degraded = true;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: providerId, ok: false, error: message });
      lastError = message;
      if (providerId === primary) {
        // continue to backup
        continue;
      }
    }
  }

  // Sanity check vs. previous successful tick
  if (quote) {
    const { data: prev } = await supabase
      .from("gold_price_ticks")
      .select("price_per_gram_24k_aed")
      .eq("status", "ok")
      .not("price_per_gram_24k_aed", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev?.price_per_gram_24k_aed) {
      const prevPrice = Number(prev.price_per_gram_24k_aed);
      const pctChange = Math.abs(quote.pricePerGram24kAed - prevPrice) / prevPrice;
      if (pctChange > 0.1) {
        // 10% jump in one tick is almost certainly a bad data point.
        degraded = true;
      }
    }
  }

  if (!quote) {
    // Persist a failure record so admin can see the outage in the gold price monitor.
    const { data, error } = await supabase
      .from("gold_price_ticks")
      .insert({
        source: primary,
        xau_usd: null,
        usd_aed: usdAed,
        price_per_gram_24k_aed: null,
        status: "failed",
        error_message: lastError.slice(0, 500),
      })
      .select("*")
      .single();
    if (error) {
      throw new GoldPriceFetchError(`DB insert failed: ${error.message}`, "db");
    }
    return { ok: false, tick: data, attempts };
  }

  const { data, error } = await supabase
    .from("gold_price_ticks")
    .insert({
      source: quote.source,
      xau_usd: quote.xauUsd,
      usd_aed: quote.usdAed,
      price_per_gram_24k_aed: quote.pricePerGram24kAed,
      status: degraded ? "degraded" : "ok",
      error_message: degraded ? lastError.slice(0, 500) || "fallback or sanity-check" : null,
    })
    .select("*")
    .single();
  if (error) {
    throw new GoldPriceFetchError(`DB insert failed: ${error.message}`, "db");
  }
  return { ok: true, tick: data, attempts };
}

/**
 * Returns the most recent usable tick. We accept either 'ok' OR 'degraded' as
 * usable for display, but the freshness window controls whether reservations
 * are allowed (see isFresh()).
 */
export async function getLatestTick() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("gold_price_ticks")
    .select("*")
    .in("status", ["ok", "degraded"])
    .not("price_per_gram_24k_aed", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function isFresh(fetchedAt: string, staleSeconds: number): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs <= staleSeconds * 1000;
}

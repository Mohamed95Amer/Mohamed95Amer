"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export interface LiveTick {
  id: number;
  source: string;
  xau_usd: number | null;
  usd_aed: number;
  price_per_gram_24k_aed: number | null;
  fetched_at: string;
  status: "ok" | "degraded" | "failed";
}

export interface LiveGoldPriceState {
  tick: LiveTick | null;
  isFresh: boolean;
  ageSeconds: number;
  staleAfterSeconds: number;
  /** How often the price is refreshed, in seconds. Shown to customers. */
  refreshIntervalSeconds: number;
  loading: boolean;
}

export const GoldPriceContext = createContext<LiveGoldPriceState | null>(null);

/**
 * Owns the single live-price connection for the whole app.
 *
 * Every price on screen reads from this one source. That matters for more than
 * efficiency: Supabase hands back the same channel object for a given name, so
 * a per-component subscription would have the second mount call .on() against
 * an already-subscribed channel and throw. Listing grids show a price per card,
 * so that would fire on any page with more than one product.
 *
 * Two independent signals keep the value correct:
 *   1. Realtime — instant updates the moment a tick is inserted.
 *   2. Poll — covers a dropped websocket or a suspended tab (Safari/iOS), and
 *      hitting the endpoint also triggers the server's refresh-on-read.
 */
export function GoldPriceProvider({
  children,
  pollMs = 10000,
}: {
  children: React.ReactNode;
  pollMs?: number;
}) {
  const [tick, setTick] = useState<LiveTick | null>(null);
  const [staleAfterSeconds, setStaleAfterSeconds] = useState(60);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(
    Math.max(1, Math.round(pollMs / 1000)),
  );
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const lastTickIdRef = useRef<number | null>(null);

  // Drives the "x seconds ago" readout.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/gold-price/latest", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          tick: LiveTick | null;
          staleAfterSeconds: number;
          refreshIntervalSeconds?: number;
        };
        if (cancelled) return;
        setStaleAfterSeconds(json.staleAfterSeconds);
        if (typeof json.refreshIntervalSeconds === "number" && json.refreshIntervalSeconds > 0) {
          setRefreshIntervalSeconds(json.refreshIntervalSeconds);
        }
        if (json.tick && json.tick.id !== lastTickIdRef.current) {
          lastTickIdRef.current = json.tick.id;
          setTick(json.tick);
        } else if (!lastTickIdRef.current) {
          setTick(json.tick);
        }
      } catch {
        // Transient; the next poll retries.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel("gold_price_ticks_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gold_price_ticks" },
        (payload) => {
          const t = payload.new as LiveTick;
          if ((t.status === "ok" || t.status === "degraded") && t.price_per_gram_24k_aed !== null) {
            lastTickIdRef.current = t.id;
            setTick(t);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchedAtMs = tick ? new Date(tick.fetched_at).getTime() : Number.NaN;
  const hasValidFetchedAt = Number.isFinite(fetchedAtMs);
  const ageSeconds = tick && hasValidFetchedAt
    ? Math.max(0, Math.floor((now - fetchedAtMs) / 1000))
    : 0;
  // A degraded quote can remain visible as the last known reference, but it is
  // never described as live or used to enable reservation.
  const isFresh = !!tick && hasValidFetchedAt && tick.status === "ok" && ageSeconds <= staleAfterSeconds;

  return (
    <GoldPriceContext.Provider
      value={{ tick, isFresh, ageSeconds, staleAfterSeconds, refreshIntervalSeconds, loading }}
    >
      {children}
    </GoldPriceContext.Provider>
  );
}

/** Read the shared live gold price. Requires GoldPriceProvider above it. */
export function useLiveGoldPrice(): LiveGoldPriceState {
  const ctx = useContext(GoldPriceContext);
  if (!ctx) {
    throw new Error("useLiveGoldPrice must be used within <GoldPriceProvider>");
  }
  return ctx;
}

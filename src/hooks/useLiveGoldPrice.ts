"use client";

import { useEffect, useRef, useState } from "react";
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
  loading: boolean;
}

/**
 * Subscribes to gold price ticks via Supabase Realtime and also polls the
 * /api/gold-price/latest endpoint as a safety net. The component re-renders
 * at most every 1s for the "X seconds ago" display.
 *
 * Two independent signals keep us correct:
 *   1. Realtime: gives us instant updates the moment a new tick is inserted.
 *   2. Poll: catches the case where the realtime websocket dropped, or where
 *      the tab was suspended (Safari/iOS).
 */
export function useLiveGoldPrice(opts?: { pollMs?: number }): LiveGoldPriceState {
  const [tick, setTick] = useState<LiveTick | null>(null);
  const [staleAfterSeconds, setStaleAfterSeconds] = useState(60);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const lastTickIdRef = useRef<number | null>(null);

  // Tick clock for "X seconds ago"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Initial fetch + polling fallback
  useEffect(() => {
    let cancelled = false;
    const pollMs = opts?.pollMs ?? 15000;

    async function refresh() {
      try {
        const res = await fetch("/api/gold-price/latest", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          tick: LiveTick | null;
          staleAfterSeconds: number;
        };
        if (cancelled) return;
        setStaleAfterSeconds(json.staleAfterSeconds);
        if (json.tick && json.tick.id !== lastTickIdRef.current) {
          lastTickIdRef.current = json.tick.id;
          setTick(json.tick);
        } else if (!lastTickIdRef.current) {
          setTick(json.tick);
        }
      } catch {
        // network error; next poll will retry
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
  }, [opts?.pollMs]);

  // Realtime subscription
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel("gold_price_ticks_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gold_price_ticks" },
        (payload) => {
          const t = payload.new as LiveTick;
          // Only accept usable ticks (ok or degraded with a value).
          if (
            (t.status === "ok" || t.status === "degraded") &&
            t.price_per_gram_24k_aed !== null
          ) {
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

  const ageSeconds = tick ? Math.max(0, Math.floor((now - new Date(tick.fetched_at).getTime()) / 1000)) : 0;
  const isFresh = !!tick && tick.status !== "failed" && ageSeconds <= staleAfterSeconds;

  return { tick, isFresh, ageSeconds, staleAfterSeconds, loading };
}

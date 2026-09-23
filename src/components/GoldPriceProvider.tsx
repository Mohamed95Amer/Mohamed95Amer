"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  const [freshnessVersion, setFreshnessVersion] = useState(0);
  const lastTickIdRef = useRef<number | null>(null);

  // Re-render once when the quote crosses the stale boundary. The visible
  // second-by-second clock lives only in the two small labels that display it;
  // keeping it out of this site-wide provider prevents every product card from
  // recalculating its price once per second.
  useEffect(() => {
    if (!tick) return;
    const fetchedAtMs = new Date(tick.fetched_at).getTime();
    if (!Number.isFinite(fetchedAtMs)) return;
    const staleAtMs = fetchedAtMs + (staleAfterSeconds + 1) * 1000;
    const delay = staleAtMs - Date.now();
    if (delay <= 0) return;
    const id = window.setTimeout(
      () => setFreshnessVersion((value) => value + 1),
      delay,
    );
    return () => window.clearTimeout(id);
  }, [tick, staleAfterSeconds]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/gold-price/latest", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          tick: LiveTick | null;
          staleAfterSeconds: number;
          refreshIntervalSeconds?: number;
        };
        if (cancelled) return;
        setStaleAfterSeconds(json.staleAfterSeconds);
        if (
          typeof json.refreshIntervalSeconds === "number" &&
          json.refreshIntervalSeconds > 0
        ) {
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
    let cancelled = false;
    let disconnect: (() => void) | null = null;

    // Price polling starts immediately above. Defer the websocket client until
    // after first paint so it does not compete with the page's critical JS.
    const connectTimer = window.setTimeout(async () => {
      const { getBrowserSupabase } = await import("@/lib/supabase/browser");
      if (cancelled) return;
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel("gold_price_ticks_live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "gold_price_ticks" },
          (payload) => {
            const t = payload.new as LiveTick;
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
      disconnect = () => {
        void supabase.removeChannel(channel);
      };
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      disconnect?.();
    };
  }, []);

  const fetchedAtMs = tick ? new Date(tick.fetched_at).getTime() : Number.NaN;
  const hasValidFetchedAt = Number.isFinite(fetchedAtMs);
  const ageSeconds =
    tick && hasValidFetchedAt
      ? Math.max(0, Math.floor((Date.now() - fetchedAtMs) / 1000))
      : 0;
  // A degraded quote can remain visible as the last known reference, but it is
  // never described as live or used to enable reservation.
  const isFresh =
    !!tick &&
    hasValidFetchedAt &&
    tick.status === "ok" &&
    ageSeconds <= staleAfterSeconds;
  const value = useMemo(
    () => ({
      tick,
      isFresh,
      ageSeconds,
      staleAfterSeconds,
      refreshIntervalSeconds,
      loading,
    }),
    // freshnessVersion deliberately invalidates the snapshot at the stale boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tick,
      isFresh,
      ageSeconds,
      staleAfterSeconds,
      refreshIntervalSeconds,
      loading,
      freshnessVersion,
    ],
  );

  return (
    <GoldPriceContext.Provider value={value}>
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

/** A local display clock for the few labels that actually show quote age. */
export function useQuoteAge(fetchedAt?: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!fetchedAt) return 0;
  const fetchedAtMs = new Date(fetchedAt).getTime();
  return Number.isFinite(fetchedAtMs)
    ? Math.max(0, Math.floor((now - fetchedAtMs) / 1000))
    : 0;
}

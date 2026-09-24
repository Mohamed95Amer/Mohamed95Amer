import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Bounded fallback used locally and if the shared service is unavailable. */
type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
let callsSinceSweep = 0;

function sweepBuckets(now: number, windowMs: number) {
  callsSinceSweep += 1;
  if (callsSinceSweep < 128 && buckets.size < MAX_BUCKETS) return;
  callsSinceSweep = 0;

  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key);
  }

  if (buckets.size >= MAX_BUCKETS) {
    const oldest = [...buckets.entries()]
      .sort(([, left], [, right]) => left.windowStart - right.windowStart)
      .slice(0, Math.max(1, buckets.size - MAX_BUCKETS + 1));
    for (const [key] of oldest) buckets.delete(key);
  }
}

export function rateLimit(key: string, maxPerWindow: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  sweepBuckets(now, windowMs);
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: maxPerWindow - 1 };
  }
  if (b.count >= maxPerWindow) return { ok: false, remaining: 0 };
  b.count += 1;
  return { ok: true, remaining: maxPerWindow - b.count };
}

const distributedLimiters = new Map<string, Ratelimit>();
const hasSharedRateLimit = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const sharedRedis = hasSharedRateLimit
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      enableTelemetry: false,
      signal: () => AbortSignal.timeout(1_000),
    })
  : null;

/**
 * Production-wide fixed-window limiter when Upstash is configured. A brief
 * Redis outage falls back to the bounded per-instance limiter rather than
 * making checkout, identity, or messaging unavailable.
 */
export async function distributedRateLimit(
  key: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<{ ok: boolean; remaining: number; source: "shared" | "local" }> {
  if (!sharedRedis) return { ...rateLimit(key, maxPerWindow, windowMs), source: "local" };

  const cacheKey = `${maxPerWindow}:${windowMs}`;
  let limiter = distributedLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: sharedRedis,
      limiter: Ratelimit.fixedWindow(maxPerWindow, `${Math.max(1, Math.ceil(windowMs / 1_000))} s`),
      prefix: "getgold:ratelimit",
      analytics: false,
      timeout: 1_000,
    });
    distributedLimiters.set(cacheKey, limiter);
  }

  try {
    const result = await limiter.limit(key);
    if (result.reason === "timeout") return { ...rateLimit(key, maxPerWindow, windowMs), source: "local" };
    return { ok: result.success, remaining: result.remaining, source: "shared" };
  } catch {
    return { ...rateLimit(key, maxPerWindow, windowMs), source: "local" };
  }
}

export function ipFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

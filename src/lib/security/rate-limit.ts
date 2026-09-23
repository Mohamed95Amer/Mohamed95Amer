/**
 * Bounded, in-memory fixed-window limiter. This protects one runtime instance;
 * production-wide enforcement still belongs in a shared store or edge WAF.
 */
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

export function ipFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

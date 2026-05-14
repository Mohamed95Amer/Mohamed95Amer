/**
 * In-memory fixed-window rate limiter. Adequate for single-instance MVP.
 * For production you'd swap this for Upstash Redis / Vercel KV.
 */
type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, maxPerWindow: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now();
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

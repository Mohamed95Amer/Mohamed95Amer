import { refreshGoldPrice } from "./service";

/**
 * Single-flight wrapper around refreshGoldPrice().
 *
 * The read endpoint refreshes the price whenever the newest tick has gone
 * stale, which means a burst of visitors would otherwise each kick off their
 * own upstream fetch. Concurrent callers within one server instance share the
 * in-flight promise instead, so a traffic spike costs one upstream request.
 *
 * A failed refresh is never fatal here: callers fall back to serving the last
 * known tick, flagged as stale, rather than showing nothing.
 */
let inFlight: Promise<void> | null = null;

/** Refuse to hammer upstream even if the stale window is set very low. */
const MIN_GAP_MS = 5_000;
let lastAttemptMs = 0;

export function refreshInBand(): Promise<void> {
  if (inFlight) return inFlight;

  const since = Date.now() - lastAttemptMs;
  if (since < MIN_GAP_MS) return Promise.resolve();

  lastAttemptMs = Date.now();
  inFlight = refreshGoldPrice()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

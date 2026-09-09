/** Compact, bounded quote age for customer-facing status text. */
export function formatQuoteAge(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;

  return `${Math.floor(days / 365)}y`;
}

/** A short sentence fragment that reads naturally after "updated". */
export function quoteRecency(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return seconds < 5 ? "just now" : `${formatQuoteAge(seconds)} ago`;
}

/** Approximate the next poll without ever displaying a negative counter. */
export function secondsUntilNextRefresh(ageSeconds: number, intervalSeconds: number): number {
  const interval = Math.max(1, Math.floor(intervalSeconds));
  const age = Number.isFinite(ageSeconds) ? Math.max(0, Math.floor(ageSeconds)) : 0;
  const elapsedInCycle = age % interval;
  return elapsedInCycle === 0 ? interval : interval - elapsedInCycle;
}

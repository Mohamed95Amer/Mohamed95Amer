
/**
 * Verify a request was made by an authorized cron caller. Accepts either:
 *   - Vercel Cron's `Authorization: Bearer ${CRON_SECRET}`
 *   - A manual call with `x-cron-secret: ${CRON_SECRET}`
 */
export function isAuthorizedCron(request: Request): boolean {
  // Read directly rather than via env.cronSecret(), which throws when unset —
  // a missing secret must deny the request, not surface as a 500.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth && auth === `Bearer ${secret}`) return true;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  return false;
}

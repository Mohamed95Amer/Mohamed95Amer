/**
 * Centralized env access. Throws if required values are missing at the call site
 * (not at module load) so build doesn't fail before envs are wired.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  // Public — safe to expose to the browser
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Server-only — must never be exposed to the browser
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  cronSecret: () => required("CRON_SECRET"),

  // Gold price providers
  primaryProvider: () => process.env.GOLD_PRICE_PRIMARY_PROVIDER ?? "mock",
  backupProvider: () => process.env.GOLD_PRICE_BACKUP_PROVIDER ?? "mock",
  goldApiKey: () => process.env.GOLDAPI_API_KEY ?? "",
  metalPriceApiKey: () => process.env.METALPRICEAPI_API_KEY ?? "",
  metalsDevApiKey: () => process.env.METALSDEV_API_KEY ?? "",
  usdAedRate: () => {
    const n = Number(process.env.USD_AED_RATE);
    return Number.isFinite(n) && n > 0 ? n : 3.6725;
  },
  stalePriceSeconds: () => optionalNumber("GOLD_PRICE_STALE_AFTER_SECONDS", 60),
  refreshIntervalSeconds: () => optionalNumber("GOLD_PRICE_REFRESH_INTERVAL_SECONDS", 20),

  // Platform pricing defaults
  platformFeeAed: () => optionalNumber("PLATFORM_FEE_AED", 0),
  deliveryFeeAed: () => optionalNumber("DELIVERY_FEE_AED", 0),
  reservationLockMinutes: () => optionalNumber("RESERVATION_LOCK_MINUTES", 10),

  // Rate limiting
  reservationsPerMin: () => optionalNumber("RATE_LIMIT_RESERVATIONS_PER_MIN", 5),
} as const;

export const GRAMS_PER_TROY_OUNCE = 31.1034768;

import { GRAMS_PER_TROY_OUNCE, env } from "@/lib/env";
import { GoldPriceFetchError, type GoldPriceProvider, type GoldPriceQuote } from "./types";

/**
 * Plausibility bounds for XAU/USD. If a provider returns a number outside
 * this range we treat the response as bogus rather than persist garbage.
 * Update as needed; intentionally wide.
 */
const XAU_USD_MIN = 500;
const XAU_USD_MAX = 20000;

function assertPlausible(xauUsd: number, provider: string) {
  if (!Number.isFinite(xauUsd) || xauUsd <= 0) {
    throw new GoldPriceFetchError(`Non-finite xauUsd: ${xauUsd}`, provider);
  }
  if (xauUsd < XAU_USD_MIN || xauUsd > XAU_USD_MAX) {
    throw new GoldPriceFetchError(
      `xauUsd ${xauUsd} outside plausible range [${XAU_USD_MIN}, ${XAU_USD_MAX}]`,
      provider,
    );
  }
}

function buildQuote(source: string, xauUsd: number, usdAed: number): GoldPriceQuote {
  assertPlausible(xauUsd, source);
  if (!Number.isFinite(usdAed) || usdAed <= 0) {
    throw new GoldPriceFetchError(`Bad usdAed: ${usdAed}`, source);
  }
  const pricePerGram24kAed = (xauUsd / GRAMS_PER_TROY_OUNCE) * usdAed;
  // Round to 4dp so we don't store noisy floats
  const rounded = Math.round(pricePerGram24kAed * 10000) / 10000;
  return {
    source,
    xauUsd,
    usdAed,
    pricePerGram24kAed: rounded,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchJson(url: string, init?: RequestInit & { timeoutMs?: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 7000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Never use Next's data cache for live prices.
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
//  Providers
// ---------------------------------------------------------------------------

/** goldapi.io — returns price per troy ounce in USD as `price`. */
export const goldApiProvider: GoldPriceProvider = {
  id: "goldapi",
  async fetch({ usdAed }) {
    const key = env.goldApiKey();
    if (!key) throw new GoldPriceFetchError("GOLDAPI_API_KEY not set", this.id);
    const json = (await fetchJson("https://www.goldapi.io/api/XAU/USD", {
      headers: { "x-access-token": key, "Content-Type": "application/json" },
    })) as { price?: number; price_gram_24k?: number };

    // Prefer their already-computed per-gram-24K if present and plausible,
    // else derive from the troy-ounce price.
    let xauUsd: number;
    if (typeof json.price === "number" && json.price > 0) {
      xauUsd = json.price;
    } else if (typeof json.price_gram_24k === "number" && json.price_gram_24k > 0) {
      xauUsd = json.price_gram_24k * GRAMS_PER_TROY_OUNCE;
    } else {
      throw new GoldPriceFetchError("Missing price fields in response", this.id);
    }
    return buildQuote(this.id, xauUsd, usdAed);
  },
};

/** metalpriceapi.com — returns rates relative to USD. */
export const metalPriceApiProvider: GoldPriceProvider = {
  id: "metalpriceapi",
  async fetch({ usdAed }) {
    const key = env.metalPriceApiKey();
    if (!key) throw new GoldPriceFetchError("METALPRICEAPI_API_KEY not set", this.id);
    const url = `https://api.metalpriceapi.com/v1/latest?api_key=${encodeURIComponent(key)}&base=USD&currencies=XAU`;
    const json = (await fetchJson(url)) as {
      success?: boolean;
      rates?: { XAU?: number; USDXAU?: number };
      error?: { info?: string };
    };
    if (json.success === false) {
      throw new GoldPriceFetchError(json.error?.info ?? "Provider returned success=false", this.id);
    }
    // The API quotes both XAU (oz per USD, fractional) and USDXAU (USD per oz).
    const usdPerOz =
      typeof json.rates?.USDXAU === "number"
        ? json.rates.USDXAU
        : typeof json.rates?.XAU === "number" && json.rates.XAU > 0
        ? 1 / json.rates.XAU
        : NaN;
    return buildQuote(this.id, usdPerOz, usdAed);
  },
};

/** metals.dev */
export const metalsDevProvider: GoldPriceProvider = {
  id: "metalsdev",
  async fetch({ usdAed }) {
    const key = env.metalsDevApiKey();
    if (!key) throw new GoldPriceFetchError("METALSDEV_API_KEY not set", this.id);
    const url = `https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(key)}&currency=USD&unit=toz`;
    const json = (await fetchJson(url)) as {
      status?: string;
      metals?: { gold?: number };
    };
    if (json.status && json.status !== "success") {
      throw new GoldPriceFetchError(`status=${json.status}`, this.id);
    }
    const usdPerOz = json.metals?.gold;
    if (typeof usdPerOz !== "number") {
      throw new GoldPriceFetchError("metals.gold missing", this.id);
    }
    return buildQuote(this.id, usdPerOz, usdAed);
  },
};

/**
 * Candidate field names for a spot price, most specific first. Providers vary
 * and some change shape between versions, so we probe rather than hard-code.
 */
const PRICE_KEYS = [
  "price", "price_usd", "priceUsd", "rate", "value",
  "spot", "ask", "last", "close",
];

/**
 * Pull a USD-per-troy-ounce figure out of a loosely-typed provider response.
 *
 * Units are auto-detected instead of assumed: a per-gram quote is ~1/31 of a
 * per-ounce quote, so anything below the plausible per-ounce floor is treated
 * as per-gram and scaled up. A response we cannot read throws, which lets the
 * service fall back to the backup provider rather than persist garbage.
 */
function extractUsdPerOunce(json: unknown, provider: string): number {
  if (!json || typeof json !== "object") {
    throw new GoldPriceFetchError(`Expected an object, got ${typeof json}`, provider);
  }
  const obj = json as Record<string, unknown>;
  for (const key of PRICE_KEYS) {
    const raw = obj[key];
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) {
      return n < XAU_USD_MIN ? n * GRAMS_PER_TROY_OUNCE : n;
    }
  }
  throw new GoldPriceFetchError(
    `No usable price field. Got keys: ${Object.keys(obj).join(", ") || "(none)"}`,
    provider,
  );
}

/**
 * gold-api.com — free, keyless, no signup, no rate-limit registration.
 * Returns live spot gold as `price` in USD per troy ounce.
 *
 * This is the default primary because it is the only source that works on a
 * fresh deploy with no credentials. The paid providers above stay available
 * for anyone who wants a contractual feed.
 */
export const goldApiComProvider: GoldPriceProvider = {
  id: "goldapicom",
  async fetch({ usdAed }) {
    const json = await fetchJson("https://api.gold-api.com/price/XAU");
    return buildQuote(this.id, extractUsdPerOunce(json, this.id), usdAed);
  },
};

/**
 * Mock provider for local dev. Emits a slowly varying value so the UI can
 * be exercised without an API key. NEVER use as primary in production —
 * it does not reflect real market data.
 */
export const mockProvider: GoldPriceProvider = {
  id: "mock",
  async fetch({ usdAed }) {
    const now = Date.now();
    const t = (now / 1000 / 60) % 60; // 60-minute cycle
    const drift = Math.sin((t / 60) * Math.PI * 2) * 25; // +/- $25
    const xauUsd = 2350 + drift;
    return buildQuote(this.id, xauUsd, usdAed);
  },
};

const PROVIDERS: Record<string, GoldPriceProvider> = {
  goldapicom: goldApiComProvider,
  goldapi: goldApiProvider,
  metalpriceapi: metalPriceApiProvider,
  metalsdev: metalsDevProvider,
  mock: mockProvider,
};

export function getProvider(id: string): GoldPriceProvider {
  const p = PROVIDERS[id];
  if (!p) throw new GoldPriceFetchError(`Unknown provider: ${id}`, id);
  return p;
}

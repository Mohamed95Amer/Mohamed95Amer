/**
 * Canonical shape returned by every provider after normalization.
 * All providers must produce these fields, no matter what their native API looks like.
 */
export interface GoldPriceQuote {
  source: string;                      // provider id, e.g. "goldapi"
  xauUsd: number;                      // USD per troy ounce (XAU=X)
  usdAed: number;                      // FX rate used
  pricePerGram24kAed: number;          // canonical, what the rest of the app uses
  fetchedAt: string;                   // ISO timestamp
}

export interface GoldPriceProvider {
  id: string;
  /**
   * Fetch the current 24K gold price. Must throw on failure.
   * Implementations are responsible for unit conversion to AED-per-gram-24K.
   */
  fetch(opts: { signal?: AbortSignal; usdAed: number }): Promise<GoldPriceQuote>;
}

export class GoldPriceFetchError extends Error {
  constructor(message: string, readonly provider: string, readonly cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "GoldPriceFetchError";
  }
}

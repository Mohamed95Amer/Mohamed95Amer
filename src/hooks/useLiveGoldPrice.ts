/**
 * Re-exported so existing imports keep working. The implementation lives with
 * the provider that owns the single shared connection.
 */
export { useLiveGoldPrice, useQuoteAge } from "@/components/GoldPriceProvider";
export type {
  LiveTick,
  LiveGoldPriceState,
} from "@/components/GoldPriceProvider";

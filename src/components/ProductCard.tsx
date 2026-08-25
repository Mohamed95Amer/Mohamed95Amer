"use client";

import Link from "next/link";
import { ProductImage } from "./ProductImage";
import { useLiveGoldPrice } from "./GoldPriceProvider";
import { computePrice, formatAed } from "@/lib/pricing/calc";

export interface ProductCardData {
  id: string;
  name: string;
  category: string;
  karat: number;
  weight_grams: number | string;
  making_charge: number | string;
  stone_value: number | string;
  vendor_premium: number | string;
  images?: unknown;
  available?: number | null;
  vendor?: { business_name: string; emirate: string; verification_status?: string } | null;
}

/**
 * A listing tile for the marketplace and home grids.
 *
 * Leads with the price, because a shopper scanning a grid is comparing prices
 * before anything else. The figure moves with the live gold rate like the one
 * on the detail page — it is advisory, and the official price is recomputed
 * server-side when the customer reserves.
 */
export function ProductCard({
  p,
  platformFee = 0,
  deliveryFee = 0,
}: {
  p: ProductCardData;
  platformFee?: number;
  deliveryFee?: number;
}) {
  const { tick, isFresh, loading } = useLiveGoldPrice();
  const stock = p.available ?? null;
  const soldOut = stock !== null && stock <= 0;

  const price =
    tick && tick.price_per_gram_24k_aed !== null
      ? computePrice({
          pricePerGram24kAed: Number(tick.price_per_gram_24k_aed),
          karat: p.karat,
          weightGrams: Number(p.weight_grams),
          makingCharge: Number(p.making_charge),
          stoneValue: Number(p.stone_value),
          vendorPremium: Number(p.vendor_premium),
          platformFee,
          deliveryFee,
        }).unitPriceAed
      : null;

  return (
    <Link
      href={`/products/${p.id}`}
      className="card group flex flex-col overflow-hidden p-0 transition hover:border-gold-300 hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bone-soft">
        <ProductImage
          category={p.category}
          karat={p.karat}
          name={p.name}
          images={p.images}
          className="transition duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-bone backdrop-blur">
          {p.karat}K
        </span>
        {soldOut && (
          <span className="absolute right-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold text-bone backdrop-blur">
            Sold out
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="text-[11px] uppercase tracking-wider text-ink-muted">{p.category}</div>
        <h3 className="font-serif text-lg leading-snug">{p.name}</h3>

        <div className="mt-2 flex items-baseline gap-2">
          {price !== null ? (
            <span className="text-xl font-semibold tabular-nums">{formatAed(price)}</span>
          ) : (
            <span className="text-sm text-ink-muted">{loading ? "Loading price…" : "Price unavailable"}</span>
          )}
          {price !== null && !isFresh && (
            <span className="text-[11px] font-medium text-signal-warn">updating…</span>
          )}
        </div>

        <div className="text-xs tabular-nums text-ink-muted">
          {Number(p.weight_grams)}g
          {stock !== null && !soldOut && <> · {stock} available</>}
        </div>

        {p.vendor && (
          <div className="mt-auto pt-3 text-xs text-ink-muted">
            {p.vendor.business_name}
            {p.vendor.verification_status === "approved" && (
              <span className="ml-1.5 font-semibold text-signal-ok">· Verified</span>
            )}
            <div className="text-[11px]">{p.vendor.emirate}</div>
          </div>
        )}
      </div>
    </Link>
  );
}

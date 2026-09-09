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
      className="group flex flex-col overflow-hidden rounded-[1.4rem] border border-jade-900/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-jade-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-jade-500"
    >
      <div className="relative aspect-[5/4] w-full overflow-hidden bg-jade-50">
        <ProductImage
          category={p.category}
          karat={p.karat}
          name={p.name}
          images={p.images}
          className="transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-jade-950/35 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-white/90 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-jade-950 shadow-sm backdrop-blur">
          {p.karat}K
        </span>
        {soldOut && (
          <span className="absolute right-3 top-3 rounded-full bg-jade-950/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
            Sold out
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          <span>{p.category}</span>
          <span className="tabular-nums">{Number(p.weight_grams)}g</span>
        </div>
        <h3 className="mt-2 font-serif text-xl font-semibold leading-snug text-jade-950">{p.name}</h3>

        <div className="mt-4 flex items-baseline gap-2">
          {price !== null ? (
            <span className="text-2xl font-bold tabular-nums tracking-tight text-jade-900">{formatAed(price)}</span>
          ) : (
            <span className="text-sm text-ink-muted">{loading ? "Loading price…" : "Price unavailable"}</span>
          )}
          {price !== null && !isFresh && (
            <span className="text-[11px] font-medium text-signal-warn">updating…</span>
          )}
        </div>

        {stock !== null && !soldOut && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-signal-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-ok" />
            {stock} available
          </div>
        )}

        {p.vendor && (
          <div className="mt-auto flex items-center justify-between gap-4 border-t border-jade-900/10 pt-4 text-xs text-ink-muted">
            <div>
              <div className="font-semibold text-ink">{p.vendor.business_name}</div>
              <div className="mt-0.5 text-[11px]">{p.vendor.emirate}</div>
            </div>
            {p.vendor.verification_status === "approved" && (
              <span className="rounded-full bg-jade-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-jade-700">
                ✓ Verified
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

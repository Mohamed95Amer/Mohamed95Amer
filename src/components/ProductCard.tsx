"use client";

import Link from "next/link";
import { ProductImage } from "./ProductImage";
import { GoldHubValueScore } from "./GoldHubValueScore";
import { StoreBadges, StoreRating } from "./StoreReputation";
import { useLiveGoldPrice } from "./GoldPriceProvider";
import { computePrice, formatAed, goldRateForKarat } from "@/lib/pricing/calc";
import { computeGoldHubValueScore } from "@/lib/pricing/value-score";
import type { VendorReputation } from "@/lib/reputation";

export interface ProductCardData {
  id: string;
  name: string;
  category: string;
  karat: number;
  weight_grams: number | string;
  making_charge: number | string;
  making_charge_discount_percent: number | string;
  making_charge_offer_ends_at: string | null;
  certificate_fee: number | string;
  stone_value: number | string;
  vendor_premium: number | string;
  vat_rate_bps?: number | string;
  images?: unknown;
  available?: number | null;
  vendor?: {
    id?: string;
    business_name: string;
    emirate: string;
    verification_status?: string;
    reputation?: VendorReputation | null;
  } | null;
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
  platformFeeBps = 100,
  deliveryFee = 0,
  priority = false,
  customerFeeDiscountPercent = 0,
  eventFeeDiscountPercent = 0,
  eventPromotionTitle = null,
  variant = "heritage",
}: {
  p: ProductCardData;
  platformFeeBps?: number;
  deliveryFee?: number;
  priority?: boolean;
  customerFeeDiscountPercent?: number;
  eventFeeDiscountPercent?: number;
  eventPromotionTitle?: string | null;
  variant?: "standard" | "heritage";
}) {
  const { tick, isFresh, loading } = useLiveGoldPrice();
  const stock = p.available ?? null;
  const soldOut = stock !== null && stock <= 0;

  const liveRate24k = tick?.price_per_gram_24k_aed === null
    ? null
    : Number(tick?.price_per_gram_24k_aed);
  const breakdown =
    tick && tick.price_per_gram_24k_aed !== null
      ? computePrice({
          pricePerGram24kAed: Number(tick.price_per_gram_24k_aed),
          karat: p.karat,
          weightGrams: Number(p.weight_grams),
          makingCharge: Number(p.making_charge),
          makingChargeDiscountPercent: Number(p.making_charge_discount_percent),
          makingChargeOfferEndsAt: p.making_charge_offer_ends_at,
          certificateFee: Number(p.certificate_fee),
          stoneValue: Number(p.stone_value),
          vendorPremium: Number(p.vendor_premium),
          platformFeeBps,
          deliveryFee,
          vatRateBps: Number(p.vat_rate_bps ?? 500),
        })
      : null;
  const price = breakdown?.unitPriceAed ?? null;
  const productGoldRate = liveRate24k === null || !Number.isFinite(liveRate24k)
    ? null
    : goldRateForKarat(liveRate24k, p.karat);
  const valueScore = breakdown
    ? computeGoldHubValueScore(breakdown, Number(p.weight_grams))
    : null;

  if (variant === "heritage") {
    return (
      <Link href={`/products/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded border border-bone-deep/60 bg-white transition hover:border-gold-500/50 hover:shadow-sm">
        <div className="relative aspect-[1.35] overflow-hidden bg-bone">
          <ProductImage category={p.category} karat={p.karat} name={p.name} images={p.images} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw" priority={priority} className="transition duration-500 group-hover:scale-105" />
          {breakdown && breakdown.makingChargeDiscountPercent > 0 && <span className="absolute left-2 top-2 rounded bg-[#a6372e] px-2 py-1 text-[10px] font-semibold text-white">{breakdown.makingChargeDiscountPercent === 100 ? "Free making" : `${breakdown.makingChargeDiscountPercent}% off making`}</span>}
          {soldOut && <span className="absolute right-2 top-2 rounded bg-ink px-2 py-1 text-[10px] text-white">Sold out</span>}
        </div>
        <div className="flex flex-1 flex-col p-3.5">
          <h3 className="min-h-10 text-sm font-medium leading-5 text-ink">{p.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{p.karat}K gold · {Number(p.weight_grams)}g{productGoldRate !== null ? ` · ${formatAed(productGoldRate)}/g` : ""}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <StoreRating reputation={p.vendor?.reputation} compact />
            {valueScore && <span className="rounded bg-jade-100 px-2 py-1 text-[10px] font-semibold text-jade-800" title={`Get Gold Value Score: ${valueScore.score}/100. ${valueScore.label}.`}>Value {valueScore.score}/100</span>}
          </div>
          {breakdown ? (
            <dl className="mt-3 space-y-1.5 text-xs [&_dd]:shrink-0 [&_dd]:text-right [&_dd]:tabular-nums">
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Live gold value ({p.karat}K)</dt><dd className="tabular-nums">{formatAed(breakdown.goldValueAed)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Making charge</dt><dd className="text-right tabular-nums">{breakdown.makingChargeDiscountPercent > 0 && <del className="mr-1 text-[10px] text-ink-muted">{formatAed(breakdown.makingChargeOriginal)}</del>}{breakdown.makingCharge === 0 ? "No charge" : formatAed(breakdown.makingCharge)}</dd></div>
              {breakdown.certificateFee > 0 && <div className="flex justify-between gap-2"><dt className="text-ink-muted">Certificate / assay</dt><dd>{formatAed(breakdown.certificateFee)}</dd></div>}
              {breakdown.stoneValue > 0 && <div className="flex justify-between gap-2"><dt className="text-ink-muted">Stones</dt><dd>{formatAed(breakdown.stoneValue)}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Get Gold fee</dt><dd>{formatAed(breakdown.platformFee)}</dd></div>
              {breakdown.deliveryFee > 0 && <div className="flex justify-between gap-2"><dt className="text-ink-muted">Delivery</dt><dd>{formatAed(breakdown.deliveryFee)}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">VAT ({breakdown.vatRateBps / 100}%)</dt><dd>{breakdown.vatRateBps === 0 ? "Not charged" : formatAed(breakdown.vatAed)}</dd></div>
              <div className="flex justify-between gap-2 border-t border-bone-deep/60 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatAed(price)}</dd></div>
            </dl>
          ) : <p className="mt-4 text-sm text-ink-muted">{loading ? "Loading price…" : "Price unavailable"}</p>}
          {price !== null && !isFresh && <p className="mt-1 text-[10px] text-signal-warn">Quote updating · checkout requires a fresh price</p>}
          {customerFeeDiscountPercent > 0 && <p className="mt-2 text-xs leading-relaxed text-jade-700">50% off Get Gold fee · first 3 orders</p>}
          {eventFeeDiscountPercent > 0 && <p className="mt-1 text-[10px] text-jade-700">{eventPromotionTitle ?? "Limited offer"} · extra {eventFeeDiscountPercent}% off fee</p>}
          {breakdown?.makingChargeOfferEndsAt && <p className="mt-1 text-[10px] text-gold-600">Making offer ends {formatShortOfferEnd(breakdown.makingChargeOfferEndsAt)}</p>}
          {p.vendor && <p className="mb-3 mt-3 text-xs leading-relaxed text-ink-muted">{p.vendor.verification_status === "approved" && <span className="text-jade-700">✓ </span>}{p.vendor.business_name} · {p.vendor.emirate}</p>}
          <span className="mt-auto flex min-h-11 items-center justify-center rounded bg-jade-800 px-3 py-2 text-xs font-semibold text-white transition group-hover:bg-jade-700">View piece &amp; price breakdown <span className="ml-2" aria-hidden="true">→</span></span>
        </div>
      </Link>
    );
  }

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
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={priority}
          className="transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-jade-950/35 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-white/90 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-jade-950 shadow-sm backdrop-blur">
          {p.karat}K
        </span>
        {breakdown && breakdown.makingChargeDiscountPercent > 0 && !soldOut && (
          <span className="absolute right-3 top-3 rounded-full bg-gold-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-jade-950 shadow-sm">
            {breakdown.makingChargeDiscountPercent === 100
              ? "Free making"
              : `${breakdown.makingChargeDiscountPercent}% off making`}
          </span>
        )}
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
            <><span className="text-2xl font-bold tabular-nums tracking-tight text-jade-900">{formatAed(price)}</span><span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">incl. VAT</span></>
          ) : (
            <span className="text-sm text-ink-muted">{loading ? "Loading price…" : "Price unavailable"}</span>
          )}
          {price !== null && !isFresh && (
            <span className="text-[11px] font-medium text-signal-warn">updating…</span>
          )}
        </div>
        {price !== null && customerFeeDiscountPercent > 0 && <p className="mt-1 text-[11px] font-bold text-gold-700">50% OFF Get Gold fee · first 3 orders</p>}
        {price !== null && eventFeeDiscountPercent > 0 && <p className="mt-1 text-[11px] font-bold text-jade-700">{eventPromotionTitle ?? "Limited offer"} · extra {eventFeeDiscountPercent}% off Get Gold fee</p>}

        {valueScore && <GoldHubValueScore value={valueScore} compact />}

        {breakdown && productGoldRate !== null && (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-jade-50 px-3 py-2.5 text-[11px]">
            <span className="text-ink-muted">{p.karat}K metal rate</span>
            <span className="text-right font-semibold tabular-nums text-jade-950">
              {formatAed(productGoldRate)}/g
            </span>
            <span className="text-ink-muted">This item&apos;s making</span>
            {breakdown.makingChargeOriginal === 0 ? (
              <span className="text-right font-semibold text-signal-ok">No charge</span>
            ) : breakdown.makingChargeDiscountPercent > 0 ? (
              <span className="text-right font-semibold tabular-nums text-jade-950">
                <span className="mr-1.5 font-normal text-ink-muted line-through">
                  {formatAed(breakdown.makingChargeOriginal)}
                </span>
                {breakdown.makingCharge === 0 ? "FREE" : formatAed(breakdown.makingCharge)}
              </span>
            ) : (
              <span className="text-right font-semibold tabular-nums text-jade-950">
                {formatAed(breakdown.makingCharge)}
              </span>
            )}
            {breakdown.certificateFee > 0 && (
              <>
                <span className="text-ink-muted">Certificate / assay</span>
                <span className="text-right font-semibold tabular-nums text-jade-950">
                  {formatAed(breakdown.certificateFee)}
                </span>
              </>
            )}
            {breakdown.makingChargeOfferEndsAt && (
              <span className="col-span-2 mt-1 border-t border-jade-900/10 pt-1.5 text-right font-semibold text-gold-600">
                Limited offer · ends {formatShortOfferEnd(breakdown.makingChargeOfferEndsAt)}
              </span>
            )}
          </div>
        )}

        {stock !== null && !soldOut && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-signal-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-ok" />
            {stock} available
          </div>
        )}

        {p.vendor && (
          <div className="mt-auto border-t border-jade-900/10 pt-4 text-xs text-ink-muted">
            <div className="flex items-start justify-between gap-4">
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
            <div className="mt-2"><StoreRating reputation={p.vendor.reputation} compact /></div>
            <div className="mt-2"><StoreBadges reputation={p.vendor.reputation} compact limit={2} /></div>
          </div>
        )}
      </div>
    </Link>
  );
}

function formatShortOfferEnd(value: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

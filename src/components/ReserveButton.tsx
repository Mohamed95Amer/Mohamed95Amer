"use client";

import { useState } from "react";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useRouter } from "next/navigation";
import { computePrice, formatAed } from "@/lib/pricing/calc";

interface ReservePricing {
  karat: number;
  weightGrams: number;
  makingCharge: number;
  makingChargeDiscountPercent: number;
  makingChargeOfferEndsAt: string | null;
  certificateFee: number;
  stoneValue: number;
  vendorPremium: number;
  platformFeeBps: number;
  deliveryFee: number;
}

export function ReserveButton({
  productId,
  soldOut = false,
  available,
  pricing,
}: {
  productId: string;
  soldOut?: boolean;
  available: number;
  pricing: ReservePricing;
}) {
  const router = useRouter();
  const { isFresh, tick } = useLiveGoldPrice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const safeMaximum = Math.max(1, Math.min(50, available));
  const disabled = busy || soldOut || !isFresh || !tick || quantity < 1 || quantity > safeMaximum;
  const breakdown = tick?.price_per_gram_24k_aed
    ? computePrice({ pricePerGram24kAed: Number(tick.price_per_gram_24k_aed), ...pricing })
    : null;
  const total = breakdown ? breakdown.unitPriceAed * quantity : null;

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?next=/products/${productId}`);
          return;
        }
        setError(json?.message ?? json?.error ?? "Could not reserve");
        return;
      }
      router.push(`/account/reservations/${json.reservation.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = busy
    ? "Reserving…"
    : soldOut
    ? "Sold out"
    : !tick
    ? "Price unavailable"
    : !isFresh
    ? "Price updating — please wait"
    : `Reserve ${quantity === 1 ? "item" : `${quantity} items`}`;

  return (
    <div className="space-y-3">
      {!soldOut && available > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-jade-50 p-3">
          <label htmlFor="reservation-quantity" className="text-sm font-semibold text-jade-950">
            Quantity
            <span className="mt-0.5 block text-xs font-normal text-ink-muted">Up to {safeMaximum} available</span>
          </label>
          <div className="flex items-center rounded-full border border-jade-900/15 bg-white p-1">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-full text-lg text-jade-900 hover:bg-jade-50">−</button>
            <input
              id="reservation-quantity"
              name="quantity"
              type="number"
              min={1}
              max={safeMaximum}
              value={quantity}
              onChange={(event) => setQuantity(Math.min(safeMaximum, Math.max(1, Number(event.target.value) || 1)))}
              className="h-9 w-12 border-0 bg-transparent text-center text-base font-semibold tabular-nums text-jade-950 focus:outline-none"
            />
            <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => Math.min(safeMaximum, value + 1))} className="grid h-9 w-9 place-items-center rounded-full text-lg text-jade-900 hover:bg-jade-50">+</button>
          </div>
        </div>
      )}
      {total !== null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Total for {quantity}</span>
          <span className="font-bold tabular-nums text-jade-950">{formatAed(total)}</span>
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-describedby={error ? "reservation-error" : "reservation-help"}
        className="hidden min-h-12 w-full items-center justify-center rounded-full bg-jade-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-jade-700 disabled:cursor-not-allowed disabled:bg-ink-muted/40 sm:flex"
      >
        {buttonLabel}
      </button>
      {error && <p id="reservation-error" role="alert" className="text-sm text-signal-err">{error}</p>}
      <p id="reservation-help" className="text-xs leading-relaxed text-ink-muted">
        Reservation locks the price for 10 minutes while the vendor confirms availability.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-jade-900/10 bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(7,47,40,0.12)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-muted">{quantity} {quantity === 1 ? "item" : "items"} · total</p>
            <p className="truncate text-base font-bold tabular-nums text-jade-950">{total === null ? "Calculating…" : formatAed(total)}</p>
          </div>
          <button type="button" disabled={disabled} onClick={onClick} className="min-h-12 rounded-full bg-jade-900 px-5 text-sm font-semibold text-white disabled:bg-ink-muted/40">{buttonLabel}</button>
        </div>
      </div>
    </div>
  );
}

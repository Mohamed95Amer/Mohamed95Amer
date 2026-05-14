"use client";

import { useState } from "react";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useRouter } from "next/navigation";

export function ReserveButton({ productId }: { productId: string }) {
  const router = useRouter();
  const { isFresh, tick } = useLiveGoldPrice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = busy || !isFresh || !tick;

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
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

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="w-full rounded-md bg-ink px-5 py-3 text-sm font-medium text-bone-soft transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-muted/40"
      >
        {busy
          ? "Reserving…"
          : !tick
          ? "Price unavailable"
          : !isFresh
          ? "Price updating — please wait"
          : "Reserve at current price"}
      </button>
      {error && <p className="text-sm text-signal-err">{error}</p>}
      <p className="text-xs text-ink-muted">
        Reservation locks the price for 10 minutes while the vendor confirms availability.
      </p>
    </div>
  );
}

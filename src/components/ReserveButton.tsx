"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useRouter } from "next/navigation";
import { computePrice, formatAed } from "@/lib/pricing/calc";
import { UAE_EMIRATES, type FulfilmentMethod } from "@/lib/fulfilment";
import { IdentityVerificationDialog } from "@/components/IdentityVerificationDialog";

type IdentityRoute = "uae_resident" | "visitor";

interface VerificationSession {
  id: string;
  verificationUrl: string;
}

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

interface DeliveryForm {
  recipientName: string;
  recipientPhone: string;
  deliveryEmirate: string;
  deliveryArea: string;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string;
  deliveryLandmark: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  deliveryMapLink: string;
  customerNote: string;
}

export function ReserveButton({
  productId,
  soldOut = false,
  available,
  pricing,
  defaultRecipientName = "",
  defaultRecipientPhone = "",
  identityVerificationAvailable = false,
}: {
  productId: string;
  soldOut?: boolean;
  available: number;
  pricing: ReservePricing;
  defaultRecipientName?: string;
  defaultRecipientPhone?: string;
  identityVerificationAvailable?: boolean;
}) {
  const router = useRouter();
  const { isFresh, tick } = useLiveGoldPrice();
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [fulfilmentMethod, setFulfilmentMethod] = useState<FulfilmentMethod>("delivery");
  const [identityRoute, setIdentityRoute] = useState<IdentityRoute>("uae_resident");
  const [verification, setVerification] = useState<VerificationSession | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [details, setDetails] = useState<DeliveryForm>({
    recipientName: defaultRecipientName,
    recipientPhone: defaultRecipientPhone,
    deliveryEmirate: "",
    deliveryArea: "",
    deliveryAddressLine1: "",
    deliveryAddressLine2: "",
    deliveryLandmark: "",
    deliveryLatitude: null,
    deliveryLongitude: null,
    deliveryMapLink: "",
    customerNote: "",
  });

  const safeMaximum = Math.max(1, Math.min(50, available));
  const disabled = busy || soldOut || !isFresh || !tick || !identityVerificationAvailable || quantity < 1 || quantity > safeMaximum;
  const breakdown = tick?.price_per_gram_24k_aed
    ? computePrice({
        pricePerGram24kAed: Number(tick.price_per_gram_24k_aed),
        ...pricing,
        deliveryFee: fulfilmentMethod === "delivery" ? pricing.deliveryFee : 0,
      })
    : null;
  const total = breakdown ? breakdown.unitPriceAed * quantity : null;
  const hasCoordinates = details.deliveryLatitude !== null && details.deliveryLongitude !== null;
  const hasPin = hasCoordinates || details.deliveryMapLink.trim().length > 0;
  const mapPreviewUrl = hasCoordinates
    ? openStreetMapPreviewUrl(details.deliveryLatitude!, details.deliveryLongitude!)
    : null;

  function update<K extends keyof DeliveryForm>(key: K, value: DeliveryForm[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  function useCurrentLocation() {
    setPinMessage(null);
    if (!navigator.geolocation) {
      setPinMessage("Location is not available in this browser. Paste a Maps pin link instead.");
      return;
    }
    setPinBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDetails((current) => ({
          ...current,
          deliveryLatitude: roundCoordinate(coords.latitude),
          deliveryLongitude: roundCoordinate(coords.longitude),
        }));
        setPinMessage("Precise location pin added.");
        setPinBusy(false);
      },
      () => {
        setPinMessage("We could not access your location. Allow location access or paste a Maps pin link.");
        setPinBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  function onMapLinkChange(value: string) {
    const coordinates = coordinatesFromMapLink(value);
    setDetails((current) => ({
      ...current,
      deliveryMapLink: value,
      ...(coordinates
        ? { deliveryLatitude: coordinates.latitude, deliveryLongitude: coordinates.longitude }
        : {}),
    }));
    setPinMessage(coordinates ? "Pin coordinates found in the Maps link." : null);
  }

  async function startIdentityVerification() {
    setBusy(true);
    try {
      const res = await fetch("/api/identity-verifications/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, verificationRoute: identityRoute }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?next=/products/${productId}`);
          return;
        }
        setError(json?.message ?? json?.error ?? "Could not start identity verification");
        return;
      }
      setVerification({ id: json.verificationId, verificationUrl: json.verificationUrl });
      setVerificationOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function placeReservation(identityVerificationId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity,
          identityVerificationId,
          fulfilmentMethod,
          ...details,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.message ?? json?.error ?? "Could not place the order");
        return;
      }
      router.push(`/account/reservations/${json.reservation.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (fulfilmentMethod === "delivery" && !hasPin) {
      setError("Add a precise location pin using your device or a Maps link.");
      return;
    }
    if (verification) {
      setVerificationOpen(true);
      return;
    }
    await startIdentityVerification();
  }

  const buttonLabel = busy
    ? "Placing order…"
    : soldOut
    ? "Sold out"
    : !tick
    ? "Price unavailable"
    : !isFresh
    ? "Price updating — please wait"
    : !identityVerificationAvailable
    ? "Identity verification setup pending"
    : verification
    ? "Continue identity check"
    : "Verify identity & lock price";

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
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

      {!soldOut && (
        <fieldset>
          <legend className="label">How would you like to receive it?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["delivery", "collection"] as const).map((method) => {
              const selected = fulfilmentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFulfilmentMethod(method)}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm transition ${selected ? "border-jade-700 bg-jade-50 text-jade-950 ring-1 ring-jade-700" : "border-jade-900/10 bg-white text-ink-muted hover:border-jade-300"}`}
                >
                  <span className="block font-semibold">{method === "delivery" ? "Delivery" : "Store collection"}</span>
                  <span className="mt-0.5 block text-[11px] font-normal">{method === "delivery" ? "To your pinned address" : "Arrange with the seller"}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {!soldOut && fulfilmentMethod === "delivery" && (
        <fieldset className="space-y-3 rounded-2xl border border-jade-900/10 bg-bone-soft p-4">
          <legend className="px-1 text-sm font-semibold text-jade-950">Delivery details</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Recipient name" htmlFor="recipient-name">
              <input id="recipient-name" className="input" autoComplete="name" required maxLength={120} value={details.recipientName} onChange={(event) => update("recipientName", event.target.value)} />
            </Field>
            <Field label="Mobile number" htmlFor="recipient-phone">
              <input id="recipient-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" required minLength={7} maxLength={20} placeholder="05X XXX XXXX" value={details.recipientPhone} onChange={(event) => update("recipientPhone", event.target.value)} />
            </Field>
            <Field label="Emirate" htmlFor="delivery-emirate">
              <select id="delivery-emirate" className="input" autoComplete="address-level1" required value={details.deliveryEmirate} onChange={(event) => update("deliveryEmirate", event.target.value)}>
                <option value="">Select emirate</option>
                {UAE_EMIRATES.map((emirate) => <option key={emirate} value={emirate}>{emirate}</option>)}
              </select>
            </Field>
            <Field label="Area / neighbourhood" htmlFor="delivery-area">
              <input id="delivery-area" className="input" autoComplete="address-level2" required maxLength={120} placeholder="e.g. Dubai Marina" value={details.deliveryArea} onChange={(event) => update("deliveryArea", event.target.value)} />
            </Field>
          </div>
          <Field label="Street, building or villa" htmlFor="delivery-address-1">
            <input id="delivery-address-1" className="input" autoComplete="address-line1" required maxLength={240} placeholder="Street name, building / villa number" value={details.deliveryAddressLine1} onChange={(event) => update("deliveryAddressLine1", event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Apartment / office (optional)" htmlFor="delivery-address-2">
              <input id="delivery-address-2" className="input" autoComplete="address-line2" maxLength={240} value={details.deliveryAddressLine2} onChange={(event) => update("deliveryAddressLine2", event.target.value)} />
            </Field>
            <Field label="Nearest landmark (optional)" htmlFor="delivery-landmark">
              <input id="delivery-landmark" className="input" maxLength={240} value={details.deliveryLandmark} onChange={(event) => update("deliveryLandmark", event.target.value)} />
            </Field>
          </div>

          <div className="rounded-xl border border-jade-900/10 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-jade-950">Exact map pin <span className="text-signal-err">*</span></p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">Pin the delivery entrance, not just the neighbourhood.</p>
              </div>
              {hasPin && <span className="pill shrink-0 border-signal-ok/25 bg-signal-ok/10 text-signal-ok">✓ Added</span>}
            </div>
            <button type="button" onClick={useCurrentLocation} disabled={pinBusy} className="btn-ghost mt-3 min-h-10 w-full px-3 py-2 text-xs">
              {pinBusy ? "Finding your location…" : "⌖ Use my current location"}
            </button>
            <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-ink-muted"><span className="h-px flex-1 bg-jade-900/10" />or<span className="h-px flex-1 bg-jade-900/10" /></div>
            <label htmlFor="delivery-map-link" className="text-xs font-medium text-jade-950">Paste a Google Maps or Apple Maps pin link</label>
            <input id="delivery-map-link" className="input mt-1" type="url" inputMode="url" placeholder="https://maps.app.goo.gl/..." maxLength={1000} value={details.deliveryMapLink} onChange={(event) => onMapLinkChange(event.target.value)} />
            {pinMessage && <p className="mt-2 text-xs text-ink-muted" aria-live="polite">{pinMessage}</p>}
            {hasCoordinates && (
              <div className="mt-3 overflow-hidden rounded-lg border border-jade-900/10">
                <iframe className="h-36 w-full" title="Delivery location pin preview" loading="lazy" src={mapPreviewUrl!} />
                <div className="flex items-center justify-between gap-3 bg-jade-50 px-3 py-2 text-[11px] text-ink-muted">
                  <span className="truncate">{details.deliveryLatitude}, {details.deliveryLongitude}</span>
                  <button type="button" className="shrink-0 font-semibold text-jade-700" onClick={() => setDetails((current) => ({ ...current, deliveryLatitude: null, deliveryLongitude: null }))}>Remove pin</button>
                </div>
              </div>
            )}
          </div>
        </fieldset>
      )}

      {!soldOut && (
        <fieldset className="rounded-2xl border border-gold-400/25 bg-gold-50 p-4">
          <legend className="px-1 text-sm font-semibold text-jade-950">Mandatory identity check</legend>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">Choose the document route that applies to the person placing this order.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["uae_resident", "visitor"] as const).map((route) => {
              const selected = identityRoute === route;
              return (
                <button
                  key={route}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setIdentityRoute(route);
                    setVerification(null);
                    setVerificationOpen(false);
                  }}
                  className={`rounded-xl border p-3 text-left transition ${selected ? "border-gold-500 bg-white text-jade-950 ring-1 ring-gold-500" : "border-jade-900/10 bg-white/60 text-ink-muted hover:border-gold-300"}`}
                >
                  <span className="block text-sm font-semibold">{route === "uae_resident" ? "UAE resident" : "Visitor"}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed">{route === "uae_resident" ? "Emirates ID, front + back" : "Passport + boarding pass"}</span>
                  <span className="mt-1 block text-[11px] font-semibold text-jade-700">+ live face match</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-muted">
            <span aria-hidden="true">🔒</span>
            <p>A new hosted check is required for every order. Get Gold keeps the signed result, not your document or face images.</p>
          </div>
          {!identityVerificationAvailable && (
            <p className="mt-3 rounded-xl border border-signal-warn/25 bg-white p-3 text-xs font-medium leading-relaxed text-signal-warn">Ordering is temporarily paused while the secure identity provider is activated. No order can bypass this check.</p>
          )}
        </fieldset>
      )}

      {!soldOut && (
        <Field label="Order note (optional)" htmlFor="customer-note">
          <textarea id="customer-note" className="input min-h-20 resize-y" maxLength={500} placeholder={fulfilmentMethod === "delivery" ? "Gate, timing or delivery instructions" : "Preferred collection time or a note for the store"} value={details.customerNote} onChange={(event) => update("customerNote", event.target.value)} />
        </Field>
      )}

      {breakdown && (
        <div className="rounded-xl border border-jade-900/10 bg-white p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted">Making for this exact item</span>
            <span className="font-semibold tabular-nums text-jade-950">{formatAed(breakdown.makingCharge)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-jade-900/10 pt-2">
            <span className="font-medium text-jade-950">Total for {quantity}</span>
            <span className="font-bold tabular-nums text-jade-950">{formatAed(total)}</span>
          </div>
          {fulfilmentMethod === "collection" && pricing.deliveryFee > 0 && <p className="mt-1 text-[11px] text-signal-ok">Collection removes the delivery charge.</p>}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        aria-describedby={error ? "reservation-error" : "reservation-help"}
        className="hidden min-h-12 w-full items-center justify-center rounded-full bg-jade-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-jade-700 disabled:cursor-not-allowed disabled:bg-ink-muted/40 sm:flex"
      >
        {buttonLabel}
      </button>
      {error && <p id="reservation-error" role="alert" className="text-sm text-signal-err">{error}</p>}
      <p id="reservation-help" className="text-xs leading-relaxed text-ink-muted">
        No payment now. Your live price is locked for 10 minutes while the store confirms the item.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-jade-900/10 bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(7,47,40,0.12)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-muted">{quantity} {quantity === 1 ? "item" : "items"} · {fulfilmentMethod}</p>
            <p className="truncate text-base font-bold tabular-nums text-jade-950">{total === null ? "Calculating…" : formatAed(total)}</p>
          </div>
          <button type="submit" disabled={disabled} className="min-h-12 rounded-full bg-jade-900 px-5 text-sm font-semibold text-white disabled:bg-ink-muted/40">{busy ? "Working…" : verification ? "Continue check" : "Verify & order"}</button>
        </div>
      </div>

      {verification && (
        <IdentityVerificationDialog
          open={verificationOpen}
          verificationId={verification.id}
          verificationUrl={verification.verificationUrl}
          route={identityRoute}
          onClose={() => setVerificationOpen(false)}
          onApproved={() => {
            setVerificationOpen(false);
            void placeReservation(verification.id);
          }}
          onStartOver={() => {
            setVerification(null);
            setVerificationOpen(false);
            setError("Start a new identity check when you are ready.");
          }}
        />
      )}
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function coordinatesFromMapLink(value: string): { latitude: number; longitude: number } | null {
  let candidate = value;
  try {
    candidate = decodeURIComponent(value);
  } catch {
    // Keep the original value when a partially pasted URL is not decodable yet.
  }
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
    /!3d(-?\d{1,2}(?:\.\d+)?)[^!]*!4d(-?\d{1,3}(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const match = candidate.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
    }
  }
  return null;
}

function openStreetMapPreviewUrl(latitude: number, longitude: number): string {
  const horizontal = 0.006;
  const vertical = 0.004;
  const bbox = [longitude - horizontal, latitude - vertical, longitude + horizontal, latitude + vertical].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

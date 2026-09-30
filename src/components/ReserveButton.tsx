"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useRouter } from "next/navigation";
import { computeOrderPricing, computePrice, formatAed } from "@/lib/pricing/calc";
import {
  coordinatesFromDeliveryMapLink,
  deliveryPinUrl,
  isAcceptedDeliveryMapLink,
  UAE_EMIRATES,
  type FulfilmentMethod,
} from "@/lib/fulfilment";
import { IdentityVerificationDialog } from "@/components/IdentityVerificationDialog";

type IdentityRoute = "uae_resident" | "visitor";
type PaymentMethod = "pay_at_store" | "pay_online" | "bank_transfer" | "aani" | "cash" | "card";

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
  vendorRateAdjustmentPerGram: number;
  assayFineness: number | null;
  platformFeeBps: number;
  deliveryFee: number;
  vatRateBps: number;
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
  onlinePaymentsEnabled = false,
  bankTransferEnabled = false,
  aaniEnabled = false,
  cashEnabled = true,
  cardEnabled = false,
  customerFeeDiscountPercent = 0,
  eventPromotionTitle = null,
  eventFeeDiscountPercent = 0,
  eventDeliveryDiscountPercent = 0,
  arabic = false,
}: {
  productId: string;
  soldOut?: boolean;
  available: number;
  pricing: ReservePricing;
  defaultRecipientName?: string;
  defaultRecipientPhone?: string;
  identityVerificationAvailable?: boolean;
  onlinePaymentsEnabled?: boolean;
  bankTransferEnabled?: boolean;
  aaniEnabled?: boolean;
  cashEnabled?: boolean;
  cardEnabled?: boolean;
  customerFeeDiscountPercent?: number;
  eventPromotionTitle?: string | null;
  eventFeeDiscountPercent?: number;
  eventDeliveryDiscountPercent?: number;
  arabic?: boolean;
}) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const router = useRouter();
  const { isFresh, tick } = useLiveGoldPrice();
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [fulfilmentMethod, setFulfilmentMethod] = useState<FulfilmentMethod>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(aaniEnabled ? "aani" : bankTransferEnabled ? "bank_transfer" : cashEnabled ? "cash" : cardEnabled ? "card" : "pay_online");
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
  const orderPricing = breakdown ? computeOrderPricing(breakdown, quantity) : null;
  const total = orderPricing?.totalAed ?? null;
  const hasCoordinates = details.deliveryLatitude !== null && details.deliveryLongitude !== null;
  const hasValidMapLink = isAcceptedDeliveryMapLink(details.deliveryMapLink);
  const hasInvalidMapLink = details.deliveryMapLink.trim().length > 0 && !hasValidMapLink;
  const hasPin = hasCoordinates || hasValidMapLink;
  const savedPinUrl = hasCoordinates
    ? deliveryPinUrl({
        fulfilment_method: "delivery",
        delivery_latitude: details.deliveryLatitude,
        delivery_longitude: details.deliveryLongitude,
      })
    : hasValidMapLink ? details.deliveryMapLink.trim() : null;
  const requiredDeliveryFields = fulfilmentMethod === "delivery"
    ? [details.recipientName, details.recipientPhone, details.deliveryEmirate, details.deliveryArea, details.deliveryAddressLine1]
    : [];
  const missingDeliveryDetails = requiredDeliveryFields.filter((value) => !value.trim()).length + (hasPin ? 0 : 1);

  function update<K extends keyof DeliveryForm>(key: K, value: DeliveryForm[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  function useCurrentLocation() {
    setPinMessage(null);
    if (!navigator.geolocation) {
      setPinMessage(t("Location is not available in this browser. Paste a Maps pin link instead.", "الموقع غير متاح في هذا المتصفح. ألصق رابط موقع من الخرائط بدلًا من ذلك."));
      return;
    }
    setPinBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDetails((current) => ({
          ...current,
          deliveryLatitude: roundCoordinate(coords.latitude),
          deliveryLongitude: roundCoordinate(coords.longitude),
          // Device coordinates are authoritative. Discard a partial URL so
          // it cannot invalidate an otherwise usable pin at submission time.
          deliveryMapLink: "",
        }));
        setPinMessage(t("Precise location pin added.", "تمت إضافة دبوس الموقع الدقيق."));
        setPinBusy(false);
      },
      () => {
        setPinMessage(t("We could not access your location. Allow location access or paste a Maps pin link.", "تعذر الوصول إلى موقعك. اسمح بالوصول للموقع أو ألصق رابطًا من الخرائط."));
        setPinBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  function onMapLinkChange(value: string) {
    const coordinates = coordinatesFromDeliveryMapLink(value);
    setDetails((current) => ({
      ...current,
      deliveryMapLink: value,
      ...(coordinates
        ? { deliveryLatitude: coordinates.latitude, deliveryLongitude: coordinates.longitude }
        : {}),
    }));
    setPinMessage(coordinates ? t("Pin coordinates found in the Maps link.", "تم العثور على إحداثيات الموقع في الرابط.") : null);
  }

  async function startIdentityVerification() {
    if (verification) { setVerificationOpen(true); return; }
    if (fulfilmentMethod === "delivery" && (!details.recipientName.trim() || !details.recipientPhone.trim() || !details.deliveryEmirate || !details.deliveryArea.trim() || !details.deliveryAddressLine1.trim() || !hasPin)) {
      setError(t("Complete the delivery address and location pin before starting identity verification.", "أكمل عنوان التوصيل ودبوس الموقع قبل بدء التحقق من الهوية.")); return;
    }
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
        setError(json?.message ?? json?.error ?? t("Could not start identity verification", "تعذر بدء التحقق من الهوية"));
        return;
      }
      setVerification({ id: json.verificationId, verificationUrl: json.verificationUrl });
      setVerificationOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network error", "خطأ في الاتصال"));
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
          paymentMethod,
          fulfilmentMethod,
          ...details,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.message ?? json?.error ?? t("Could not place the order", "تعذر إنشاء الطلب"));
        return;
      }
      router.push(`/account/reservations/${json.reservation.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network error", "خطأ في الاتصال"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (fulfilmentMethod === "delivery" && hasInvalidMapLink) {
      setError(t("Paste a full Google Maps or Apple Maps https:// link, or clear the map-link field.", "ألصق رابط https:// كاملًا من Google Maps أو Apple Maps، أو امسح حقل الرابط."));
      return;
    }
    if (fulfilmentMethod === "delivery" && !hasPin) {
      setError(t("Add a precise location pin using your device or a Maps link.", "أضف دبوس موقع دقيقًا باستخدام جهازك أو رابط الخرائط."));
      return;
    }
    if (verification) {
      setVerificationOpen(true);
      return;
    }
    await startIdentityVerification();
  }

  const buttonLabel = busy
    ? t("Placing order…", "جارٍ إنشاء الطلب…")
    : soldOut
    ? t("Sold out", "نفد المخزون")
    : !tick
    ? t("Price unavailable", "السعر غير متاح")
    : !isFresh
    ? t("Price updating — please wait", "جارٍ تحديث السعر — يرجى الانتظار")
    : !identityVerificationAvailable
    ? t("Live ordering not activated", "الطلبات المباشرة غير مفعّلة")
    : verification
    ? t("Continue identity check", "متابعة التحقق من الهوية")
    : t("Verify identity & request to buy", "تحقق من هويتك واطلب الشراء");

  if (!checkoutOpen) return <button className="btn-primary w-full" type="button" disabled={soldOut} onClick={() => setCheckoutOpen(true)}>{soldOut ? t("Sold out", "نفد المخزون") : t("Proceed to checkout", "المتابعة إلى الطلب")}</button>;
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <h2 className="font-serif text-2xl">{t("Checkout", "إتمام الطلب")}</h2>
      <p className="text-xs text-ink-muted">{t("Review your details before starting the identity check. Opening this checkout does not create a verification attempt.", "راجع بياناتك قبل بدء التحقق من الهوية. فتح هذه الخطوة لا ينشئ محاولة تحقق.")}</p>
      {!identityVerificationAvailable && (
        <div role="status" className="rounded-2xl border border-signal-warn/25 bg-gold-50 p-4 text-sm leading-relaxed text-jade-950">
          <p className="font-semibold">{t("Public checkout is currently a preview", "إتمام الطلب متاح للمعاينة حاليًا")}</p>
          <p className="mt-1 text-xs text-ink-muted">{t("You can review the full order form, but no information can be submitted and no verification attempt can start until live identity verification is activated.", "يمكنك مراجعة نموذج الطلب، لكن لا يمكن إرساله أو بدء التحقق حتى تفعيل خدمة التحقق المباشر من الهوية.")}</p>
        </div>
      )}
      {customerFeeDiscountPercent > 0 && <p className="rounded-xl bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-700">{t("50% OFF the standard 1% Get Gold fee for one of your first 3 orders. The discount is secured when you place this order.", "خصم 50٪ على رسوم Get Gold المعتادة البالغة 1٪ لأحد أول 3 طلبات لك. يثبت الخصم عند إنشاء الطلب.")}</p>}
      {eventPromotionTitle && <p className="rounded-xl border border-gold-300/40 bg-white px-3 py-2 text-xs font-semibold text-jade-800">{eventPromotionTitle}: {eventFeeDiscountPercent > 0 ? t(`${eventFeeDiscountPercent}% extra off the Get Gold fee`, `خصم إضافي ${eventFeeDiscountPercent}٪ على رسوم Get Gold`) : ""}{eventFeeDiscountPercent > 0 && eventDeliveryDiscountPercent > 0 ? " · " : ""}{eventDeliveryDiscountPercent === 100 ? t("free delivery", "توصيل مجاني") : eventDeliveryDiscountPercent > 0 ? t(`${eventDeliveryDiscountPercent}% off delivery`, `خصم ${eventDeliveryDiscountPercent}٪ على التوصيل`) : ""}.</p>}
      {!soldOut && available > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-jade-50 p-3">
          <label htmlFor="reservation-quantity" className="text-sm font-semibold text-jade-950">
            {t("Quantity", "الكمية")}
            <span className="mt-0.5 block text-xs font-normal text-ink-muted">{t(`Up to ${safeMaximum} available`, `المتاح حتى ${safeMaximum} وحدات`)}</span>
          </label>
          <div className="flex items-center rounded-full border border-jade-900/15 bg-white p-1">
            <button type="button" aria-label={t("Decrease quantity", "تقليل الكمية")} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-full text-lg text-jade-900 hover:bg-jade-50">−</button>
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
            <button type="button" aria-label={t("Increase quantity", "زيادة الكمية")} onClick={() => setQuantity((value) => Math.min(safeMaximum, value + 1))} className="grid h-9 w-9 place-items-center rounded-full text-lg text-jade-900 hover:bg-jade-50">+</button>
          </div>
        </div>
      )}

      {!soldOut && (
        <fieldset>
          <legend className="label">{t("How would you like to receive it?", "كيف تريد استلامها؟")}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["delivery", "collection"] as const).map((method) => {
              const selected = fulfilmentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFulfilmentMethod(method)}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-start text-sm transition ${selected ? "border-jade-700 bg-jade-50 text-jade-950 ring-1 ring-jade-700" : "border-jade-900/10 bg-white text-ink-muted hover:border-jade-300"}`}
                >
                  <span className="block font-semibold">{method === "delivery" ? t("Delivery", "توصيل") : t("Store collection", "استلام من المتجر")}</span>
                  <span className="mt-0.5 block text-[11px] font-normal">{method === "delivery" ? t("To your pinned address", "إلى العنوان المحدد على الخريطة") : t("Arrange with the seller", "بالتنسيق مع المتجر")}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {!soldOut && fulfilmentMethod === "delivery" && (
        <fieldset className="space-y-3 rounded-2xl border border-jade-900/10 bg-bone-soft p-4">
          <legend className="px-1 text-sm font-semibold text-jade-950">{t("Delivery details", "تفاصيل التوصيل")}</legend>
          <p className={`text-xs font-medium ${missingDeliveryDetails === 0 ? "text-signal-ok" : "text-ink-muted"}`}>
            {missingDeliveryDetails === 0 ? t("✓ Delivery details ready", "✓ تفاصيل التوصيل جاهزة") : t(`${missingDeliveryDetails} required ${missingDeliveryDetails === 1 ? "detail" : "details"} remaining`, `تبقى ${missingDeliveryDetails} من البيانات المطلوبة`)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label={t("Recipient name", "اسم المستلم")} htmlFor="recipient-name" required>
              <input id="recipient-name" className="input" autoComplete="name" required maxLength={120} value={details.recipientName} onChange={(event) => update("recipientName", event.target.value)} />
            </Field>
            <Field label={t("Mobile number", "رقم الهاتف")} htmlFor="recipient-phone" required>
              <input id="recipient-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" required minLength={7} maxLength={20} placeholder="05X XXX XXXX" value={details.recipientPhone} onChange={(event) => update("recipientPhone", event.target.value)} />
            </Field>
            <Field label={t("Emirate", "الإمارة")} htmlFor="delivery-emirate" required>
              <select id="delivery-emirate" className="input" autoComplete="address-level1" required value={details.deliveryEmirate} onChange={(event) => update("deliveryEmirate", event.target.value)}>
                <option value="">{t("Select emirate", "اختر الإمارة")}</option>
                {UAE_EMIRATES.map((emirate) => <option key={emirate} value={emirate}>{emirate}</option>)}
              </select>
            </Field>
            <Field label={t("Area / neighbourhood", "المنطقة / الحي")} htmlFor="delivery-area" required>
              <input id="delivery-area" className="input" autoComplete="address-level2" required maxLength={120} placeholder={t("e.g. Dubai Marina", "مثلًا: دبي مارينا")} value={details.deliveryArea} onChange={(event) => update("deliveryArea", event.target.value)} />
            </Field>
          </div>
          <Field label={t("Street, building or villa", "الشارع والمبنى أو الفيلا")} htmlFor="delivery-address-1" required>
            <input id="delivery-address-1" className="input" autoComplete="address-line1" required maxLength={240} placeholder={t("Street name, building / villa number", "اسم الشارع ورقم المبنى / الفيلا")} value={details.deliveryAddressLine1} onChange={(event) => update("deliveryAddressLine1", event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label={t("Apartment / office (optional)", "الشقة / المكتب (اختياري)")} htmlFor="delivery-address-2">
              <input id="delivery-address-2" className="input" autoComplete="address-line2" maxLength={240} value={details.deliveryAddressLine2} onChange={(event) => update("deliveryAddressLine2", event.target.value)} />
            </Field>
            <Field label={t("Nearest landmark (optional)", "أقرب معلم (اختياري)")} htmlFor="delivery-landmark">
              <input id="delivery-landmark" className="input" maxLength={240} value={details.deliveryLandmark} onChange={(event) => update("deliveryLandmark", event.target.value)} />
            </Field>
          </div>

          <div className="rounded-xl border border-jade-900/10 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-jade-950">{t("Exact map pin", "دبوس الموقع الدقيق")} <span className="text-signal-err">*</span></p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{t("Pin the delivery entrance, not just the neighbourhood.", "حدد مدخل التوصيل، وليس الحي فقط.")}</p>
              </div>
              {hasPin && <span className="pill shrink-0 border-signal-ok/25 bg-signal-ok/10 text-signal-ok">✓ {t("Added", "تمت الإضافة")}</span>}
            </div>
            <button type="button" onClick={useCurrentLocation} disabled={pinBusy} className="btn-ghost mt-3 min-h-10 w-full px-3 py-2 text-xs">
              {pinBusy ? t("Finding your location…", "جارٍ تحديد موقعك…") : t("⌖ Use my current location", "⌖ استخدم موقعي الحالي")}
            </button>
            <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-ink-muted"><span className="h-px flex-1 bg-jade-900/10" />{t("or", "أو")}<span className="h-px flex-1 bg-jade-900/10" /></div>
            <label htmlFor="delivery-map-link" className="text-xs font-medium text-jade-950">{t("Paste a Google Maps or Apple Maps pin link", "ألصق رابط موقع من Google Maps أو Apple Maps")}</label>
            <input id="delivery-map-link" className={`input mt-1 ${hasInvalidMapLink ? "border-signal-err" : ""}`} type="text" inputMode="url" autoCapitalize="none" spellCheck={false} aria-invalid={hasInvalidMapLink} aria-describedby={hasInvalidMapLink ? "delivery-map-link-error" : undefined} placeholder="https://maps.app.goo.gl/..." maxLength={1000} value={details.deliveryMapLink} onChange={(event) => onMapLinkChange(event.target.value)} />
            {hasInvalidMapLink && <p id="delivery-map-link-error" className="mt-1 text-xs font-medium text-signal-err">{t("Use a full secure Google Maps or Apple Maps link.", "استخدم رابطًا آمنًا وكاملًا من Google Maps أو Apple Maps.")}</p>}
            {pinMessage && <p className="mt-2 text-xs text-ink-muted" aria-live="polite">{pinMessage}</p>}
            {hasPin && (
              <div className="mt-3 rounded-lg border border-signal-ok/20 bg-jade-50 p-3">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-lg shadow-sm">⌖</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-jade-950">{hasCoordinates ? t("Exact coordinates saved", "تم حفظ الإحداثيات الدقيقة") : t("Maps pin link saved", "تم حفظ رابط الموقع")}</p>
                    <p className="truncate text-[11px] text-ink-muted">{hasCoordinates ? `${details.deliveryLatitude}, ${details.deliveryLongitude}` : details.deliveryMapLink.trim()}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-jade-900/10 pt-2 text-[11px]">
                  {savedPinUrl && <a className="font-semibold text-jade-700 underline" href={savedPinUrl} target="_blank" rel="noreferrer">{t("Open map", "افتح الخريطة")} ↗</a>}
                  <button type="button" className="ml-auto font-semibold text-signal-err" onClick={() => setDetails((current) => ({ ...current, deliveryLatitude: null, deliveryLongitude: null, deliveryMapLink: "" }))}>{t("Remove pin", "حذف الموقع")}</button>
                </div>
              </div>
            )}
          </div>
        </fieldset>
      )}

      {!soldOut && (
        <fieldset>
          <legend className="label">{t("How would you like to pay?", "كيف تريد الدفع؟")}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([...(aaniEnabled ? ["aani" as const] : []), ...(bankTransferEnabled ? ["bank_transfer" as const] : []), ...(cashEnabled ? ["cash" as const] : []), ...(cardEnabled ? ["card" as const] : []), "pay_online"] as const).map((method) => {
              const unavailable = method === "pay_online" && !onlinePaymentsEnabled;
              const selected = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selected}
                  onClick={() => setPaymentMethod(method)}
                  className={`min-h-16 rounded-xl border px-3 py-2 text-start text-sm transition ${selected ? "border-jade-700 bg-jade-50 text-jade-950 ring-1 ring-jade-700" : "border-jade-900/10 bg-white text-ink-muted hover:border-jade-300"} disabled:cursor-not-allowed disabled:opacity-55`}
                >
                  <span className="block font-semibold">{method === "aani" ? t("Aani instant transfer", "تحويل آني فوري") : method === "bank_transfer" ? t("Bank transfer", "تحويل بنكي") : method === "pay_online" ? t("Pay online", "دفع إلكتروني") : method === "card" ? t("Card to the store", "بطاقة لدى المتجر") : t("Cash to the store", "نقدًا للمتجر")}</span>
                  <span className="mt-0.5 block text-[11px] font-normal">{method === "aani" ? t("Pay the store directly after it confirms availability and price", "ادفع للمتجر مباشرةً بعد تأكيد التوفر والسعر") : method === "bank_transfer" ? t("Transfer to the vendor only after accepting its final price", "حوّل للمتجر فقط بعد قبول السعر النهائي") : method === "pay_online" ? unavailable ? t("Activates after our payment partner is connected", "يتفعّل بعد ربط شريك الدفع") : t("Secure checkout after stock confirmation", "دفع آمن بعد تأكيد المخزون") : t("Pay directly at collection or as arranged", "ادفع مباشرةً عند الاستلام أو حسب الاتفاق")}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {!soldOut && (
        <fieldset className="rounded-2xl border border-gold-400/25 bg-gold-50 p-4">
          <legend className="px-1 text-sm font-semibold text-jade-950">{t("Mandatory identity check", "التحقق الإلزامي من الهوية")}</legend>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t("Choose the document route that applies to the person placing this order.", "اختر نوع المستند المناسب للشخص الذي يقدم هذا الطلب.")}</p>
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
                  className={`rounded-xl border p-3 text-start transition ${selected ? "border-gold-500 bg-white text-jade-950 ring-1 ring-gold-500" : "border-jade-900/10 bg-white/60 text-ink-muted hover:border-gold-300"}`}
                >
                  <span className="block text-sm font-semibold">{route === "uae_resident" ? t("UAE resident", "مقيم في الإمارات") : t("Visitor", "زائر")}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed">{route === "uae_resident" ? t("Emirates ID, front + back", "الهوية الإماراتية، الوجه الأمامي والخلفي") : t("Passport", "جواز السفر")}</span>
                  <span className="mt-1 block text-[11px] font-semibold text-jade-700">+ {t("live face match", "مطابقة الوجه المباشرة")}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-muted">
            <span aria-hidden="true">🔒</span>
            <p>{t("A new hosted check is required for every order. Get Gold keeps the signed result, not your document or face images.", "يلزم تحقق جديد لكل طلب عبر مزود آمن. يحتفظ Get Gold بنتيجة التحقق الموقّعة فقط، لا بصور المستند أو الوجه.")}</p>
          </div>
          {!identityVerificationAvailable && (
            <p className="mt-3 rounded-xl border border-signal-warn/25 bg-white p-3 text-xs font-medium leading-relaxed text-signal-warn">{t("Ordering is temporarily paused while the secure identity provider is activated. No order can bypass this check.", "الطلبات متوقفة مؤقتًا حتى تفعيل مزود التحقق الآمن. لا يمكن لأي طلب تجاوز هذا الفحص.")}</p>
          )}
        </fieldset>
      )}

      {!soldOut && (
        <Field label={t("Order note (optional)", "ملاحظة للطلب (اختياري)")} htmlFor="customer-note">
          <textarea id="customer-note" className="input min-h-20 resize-y" maxLength={500} placeholder={fulfilmentMethod === "delivery" ? t("Gate, timing or delivery instructions", "البوابة أو الموعد أو تعليمات التوصيل") : t("Preferred collection time or a note for the store", "موعد الاستلام المفضل أو ملاحظة للمتجر")} value={details.customerNote} onChange={(event) => update("customerNote", event.target.value)} />
        </Field>
      )}

      {breakdown && (
        <div className="rounded-xl border border-jade-900/10 bg-white p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted">{t("Making for this exact item", "مصنعية هذه القطعة تحديدًا")}</span>
            <span className="font-semibold tabular-nums text-jade-950">{formatAed(breakdown.makingCharge)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-jade-900/10 pt-2">
            <span className="text-ink-muted">{t("VAT", "ضريبة القيمة المضافة")} ({breakdown.vatRateBps / 100}%)</span>
            <span className="font-semibold tabular-nums text-jade-950">{breakdown.vatRateBps === 0 ? t("Not charged", "لا تُفرض") : formatAed(orderPricing?.vatAed)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-jade-900/10 pt-2">
            <span className="font-medium text-jade-950">{t(`Total for ${quantity}`, `الإجمالي لعدد ${quantity}`)}</span>
            <span className="font-bold tabular-nums text-jade-950">{formatAed(total)}</span>
          </div>
          {breakdown && <p className="mt-1 text-[11px] text-ink-muted">{t(`Delivery: ${formatAed(breakdown.deliveryFee)} once per order. Store collection has no delivery charge.`, `التوصيل: ${formatAed(breakdown.deliveryFee)} مرة واحدة لكل طلب. الاستلام من المتجر بلا رسوم توصيل.`)}</p>}
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
        {paymentMethod === "pay_online"
          ? t("No charge yet. Secure online checkout opens only after the store confirms stock.", "لا توجد رسوم الآن. يفتح الدفع الإلكتروني الآمن فقط بعد تأكيد المتجر للمخزون.")
          : t("No payment now. This sends a purchase request only. The store must confirm availability and the final current price before payment details appear.", "لا تدفع الآن. يُرسل طلب الشراء فقط، ويجب أن يؤكد المتجر التوفر والسعر النهائي الحالي قبل ظهور تفاصيل الدفع.")}
      </p>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-jade-900/10 bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(7,47,40,0.12)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-muted">{quantity} {t(quantity === 1 ? "item" : "items", quantity === 1 ? "قطعة" : "قطع")} · {fulfilmentMethod === "delivery" ? t("delivery", "توصيل") : t("collection", "استلام")}</p>
            <p className="truncate text-base font-bold tabular-nums text-jade-950">{total === null ? t("Calculating…", "جارٍ الحساب…") : formatAed(total)}</p>
          </div>
          <button type="submit" disabled={disabled} className="min-h-12 rounded-full bg-jade-900 px-5 text-sm font-semibold text-white disabled:bg-ink-muted/40">{buttonLabel}</button>
        </div>
      </div>

      {verification && (
        <IdentityVerificationDialog
          arabic={arabic}
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
            setError(t("Start a new identity check when you are ready.", "ابدأ تحققًا جديدًا من الهوية حين تكون جاهزًا."));
          }}
        />
      )}
    </form>
  );
}

function Field({ label, htmlFor, children, required = false }: { label: string; htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}{required && <span className="ml-1 text-signal-err" aria-hidden="true">*</span>}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

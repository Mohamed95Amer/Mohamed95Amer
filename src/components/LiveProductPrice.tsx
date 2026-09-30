"use client";

import { useLiveGoldPrice, useQuoteAge } from "@/hooks/useLiveGoldPrice";
import { GoldHubValueScore } from "@/components/GoldHubValueScore";
import { computePrice, formatAed, goldRateForKarat, KARAT_FINENESS_RANGE } from "@/lib/pricing/calc";
import { computeGoldHubValueScore } from "@/lib/pricing/value-score";
import { quoteRecency } from "@/lib/time";

interface Props {
  karat: number;
  weightGrams: number;
  makingCharge: number;
  makingChargeDiscountPercent: number;
  makingChargeOfferEndsAt: string | null;
  certificateFee: number;
  stoneValue: number;
  vendorPremium: number;
  vendorRateAdjustmentPerGram?: number;
  assayFineness?: number | null;
  vatRateBps?: number;
  platformFeeBps?: number;
  customerFeeDiscountPercent?: number;
  discountedOrdersRemaining?: number;
  eventFeeDiscountPercent?: number;
  eventDeliveryDiscountPercent?: number;
  eventPromotionTitle?: string | null;
  deliveryFeeBeforeEventDiscount?: number;
  deliveryFee?: number;
  showBreakdown?: boolean;
  showFooter?: boolean;
  arabic?: boolean;
}

/**
 * Displays the live, advisory price for a product. The official price is
 * always recomputed server-side at reservation time — this component is
 * for the customer-facing display only.
 */
export function LiveProductPrice(props: Props) {
  const t = (en: string, ar: string) => props.arabic ? ar : en;
  const { tick, isFresh, refreshIntervalSeconds, loading } = useLiveGoldPrice();
  const ageSeconds = useQuoteAge(tick?.fetched_at);

  if (loading || !tick || tick.price_per_gram_24k_aed === null) {
    return (
      <div className="text-ink-muted text-sm">
        {loading ? t("Loading price…", "جارٍ تحميل السعر…") : t("Price unavailable", "السعر غير متاح")}
      </div>
    );
  }

  const breakdown = computePrice({
    pricePerGram24kAed: Number(tick.price_per_gram_24k_aed),
    karat: props.karat,
    weightGrams: props.weightGrams,
    makingCharge: props.makingCharge,
    makingChargeDiscountPercent: props.makingChargeDiscountPercent,
    makingChargeOfferEndsAt: props.makingChargeOfferEndsAt,
    certificateFee: props.certificateFee,
    stoneValue: props.stoneValue,
    vendorPremium: props.vendorPremium,
    vendorRateAdjustmentPerGram: props.vendorRateAdjustmentPerGram ?? 0,
    assayFineness: props.assayFineness ?? null,
    platformFeeBps: props.platformFeeBps ?? 100,
    deliveryFee: props.deliveryFee ?? 0,
    vatRateBps: props.vatRateBps ?? 500,
  });
  const liveRate24k = Number(tick.price_per_gram_24k_aed);
  const productGoldRate = goldRateForKarat(liveRate24k, props.karat);
  const valueScore = computeGoldHubValueScore(breakdown, props.weightGrams);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="font-serif text-4xl font-semibold tracking-tight text-jade-950">
          {formatAed(breakdown.unitPriceAed)}
        </div>
        {isFresh ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-signal-ok">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-ok opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-ok" />
            </span>
            {t("Live price", "سعر مباشر")}
          </span>
        ) : (
          <span className="text-xs font-medium text-signal-warn">
            {t("Price updating…", "جارٍ تحديث السعر…")}
          </span>
        )}
      </div>
      {valueScore && <GoldHubValueScore value={valueScore} arabic={props.arabic} />}
      {props.showBreakdown && (
        <div className="mt-5 border-t border-jade-900/10 pt-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-jade-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                {t("Live 24K market rate", "سعر السوق المباشر لعيار 24")}
              </p>
              <p className="mt-1 font-semibold tabular-nums text-jade-950">
                {formatAed(liveRate24k)}/g
              </p>
            </div>
            <div className="rounded-xl bg-gold-100/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                {t(`${props.karat}K metal rate`, `سعر الذهب عيار ${props.karat}`)}
              </p>
              <p className="mt-1 font-semibold tabular-nums text-jade-950">
                {formatAed(productGoldRate)}/g
              </p>
            </div>
          </div>
          {KARAT_FINENESS_RANGE[props.karat] && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              {props.karat === 21
                ? t("Vendor-reported 21K fineness range: 875–880‰; estimate uses 880‰. The store confirms the final price before payment.", "نطاق النقاوة المبلّغ به من المتجر لعيار 21: من 875 إلى 880 بالألف؛ يعتمد التقدير 880. يؤكد المتجر السعر النهائي قبل الدفع.")
                : t("Vendor-reported 22K fineness range: 916–920‰; estimate uses 920‰. The store confirms the final price before payment.", "نطاق النقاوة المبلّغ به من المتجر لعيار 22: من 916 إلى 920 بالألف؛ يعتمد التقدير 920. يؤكد المتجر السعر النهائي قبل الدفع.")}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-jade-950">
              {t("Price breakdown", "تفصيل السعر")}
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              {t("One-item order", "طلب قطعة واحدة")}
            </span>
          </div>
          {breakdown.assayFineness !== null && (
            <p className="mt-2 text-xs text-ink-muted">
              {t(`Certified bullion fineness: ${breakdown.assayFineness}‰ · metal value uses the exact assay against the 999 24K reference.`, `نقاوة السبيكة المعتمدة: ${breakdown.assayFineness}‰ · تُحسب قيمة الذهب وفق النقاوة الفعلية مقارنةً بمرجع عيار 24 بنقاوة 999.`)}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-y-2.5 text-sm text-ink-muted">
            <dt>
              {t(`Gold (${props.karat}K × ${props.weightGrams}g)`, `الذهب (${props.karat} عيار × ${props.weightGrams} غرام)`)}
            </dt>
            <dd className="text-right tabular-nums text-ink">
              {formatAed(breakdown.goldValueAed)}
            </dd>
            <dt className="flex flex-wrap items-center gap-1.5">
              {t("Making charge for this item", "مصنعية هذه القطعة")}
              {breakdown.makingChargeDiscountPercent > 0 && (
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-600">
                  {t(`${breakdown.makingChargeDiscountPercent}% off`, `خصم ${breakdown.makingChargeDiscountPercent}٪`)}
                </span>
              )}
            </dt>
            <dd className="text-right tabular-nums text-ink">
              {breakdown.makingChargeOriginal === 0 ? (
                <span className="font-semibold text-signal-ok">{t("No charge", "بدون رسوم")}</span>
              ) : breakdown.makingChargeDiscountPercent > 0 ? (
                <>
                  <span className="mr-2 text-ink-muted line-through">
                    {formatAed(breakdown.makingChargeOriginal)}
                  </span>
                  <span className="font-semibold text-jade-950">
                    {breakdown.makingCharge === 0
                      ? t("FREE", "مجانًا")
                      : formatAed(breakdown.makingCharge)}
                  </span>
                </>
              ) : (
                formatAed(breakdown.makingCharge)
              )}
            </dd>
            {breakdown.makingChargeDiscountPercent > 0 && (
              <>
                <dt className="text-signal-ok">{t("You save on making", "توفير في المصنعية")}</dt>
                <dd className="text-right font-semibold tabular-nums text-signal-ok">
                  −{formatAed(breakdown.makingChargeDiscountAed)}
                </dd>
              </>
            )}
            {breakdown.makingChargeOfferEndsAt && (
              <>
                <dt>{t("Limited-time offer ends", "ينتهي العرض في")}</dt>
                <dd className="text-right font-medium text-ink">
                  {formatOfferEnd(breakdown.makingChargeOfferEndsAt, props.arabic)}
                </dd>
              </>
            )}
            {breakdown.certificateFee > 0 && (
              <>
                <dt>{t("Certificate / assay fee", "رسوم الشهادة / الفحص")}</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatAed(breakdown.certificateFee)}
                </dd>
              </>
            )}
            {breakdown.stoneValue > 0 && (
              <>
                <dt>{t("Stone value", "قيمة الأحجار")}</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatAed(breakdown.stoneValue)}
                </dd>
              </>
            )}
            {breakdown.vendorRateAdjustmentAed > 0 && (
              <>
                <dt>
                  {t("Store rate adjustment", "تعديل سعر المتجر")} (
                  {formatAed(breakdown.vendorRateAdjustmentPerGram)}/g)
                </dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatAed(breakdown.vendorRateAdjustmentAed)}
                </dd>
              </>
            )}
            <dt>
              {t("Get Gold fee", "رسوم Get Gold")}{" "}
              {props.customerFeeDiscountPercent ? (
                <span className="ml-1 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-700">
                  {t("50% OFF", "خصم 50٪")}
                </span>
              ) : null}
              {props.eventFeeDiscountPercent ? (
                <span className="ml-1 rounded-full bg-jade-100 px-2 py-0.5 text-[10px] font-bold text-jade-700">
                  {t(`EXTRA ${props.eventFeeDiscountPercent}% OFF`, `خصم إضافي ${props.eventFeeDiscountPercent}٪`)}
                </span>
              ) : null}
            </dt>
            <dd className="text-right tabular-nums text-ink">
              <span className="mr-2 text-xs text-ink-muted">
                {breakdown.platformFeeBps / 100}%
              </span>
              {formatAed(breakdown.platformFee)}
            </dd>
            <dt>{t("Delivery fee (once per order)", "رسوم التوصيل (مرة واحدة لكل طلب)")}</dt>
            <dd className="text-right tabular-nums text-ink">
              {props.eventDeliveryDiscountPercent ? (
                <span className="mr-2 text-ink-muted line-through">
                  {formatAed(props.deliveryFeeBeforeEventDiscount)}
                </span>
              ) : null}
              {breakdown.deliveryFee === 0 &&
              props.eventDeliveryDiscountPercent ? (
                <span className="font-semibold text-signal-ok">{t("FREE", "مجانًا")}</span>
              ) : (
                formatAed(breakdown.deliveryFee)
              )}
            </dd>
            <dt>{t("VAT", "ضريبة القيمة المضافة")} ({breakdown.vatRateBps / 100}%)</dt>
            <dd className="text-right tabular-nums text-ink">
              {breakdown.vatRateBps === 0 ? (
                <span className="font-semibold text-signal-ok">
                  {t("Not charged", "لا تُفرض")}
                </span>
              ) : (
                formatAed(breakdown.vatAed)
              )}
            </dd>
            <dt className="mt-1 border-t border-jade-900/10 pt-3 font-semibold text-jade-950">
              {t("Total", "الإجمالي")}
            </dt>
            <dd className="mt-1 border-t border-jade-900/10 pt-3 text-right font-bold tabular-nums text-jade-950">
              {formatAed(breakdown.unitPriceAed)}
            </dd>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            {t(`The ${props.karat}K rate is the metal-only value per gram. Making, certificate or assay, stones, service, delivery and VAT are listed separately above when applicable.`, `سعر عيار ${props.karat} هو قيمة الذهب فقط لكل غرام. تُعرض المصنعية والشهادة أو الفحص والأحجار ورسوم الخدمة والتوصيل والضريبة بشكل منفصل أعلاه عند انطباقها.`)}
          </p>
          {props.customerFeeDiscountPercent ? (
            <p className="mt-2 text-[11px] font-medium text-jade-700">
              {t("Introductory offer: 50% off the standard 1% Get Gold fee for your first 3 active or completed orders", "عرض ترحيبي: خصم 50٪ من رسوم Get Gold المعتادة البالغة 1٪ لأول 3 طلبات نشطة أو مكتملة")}
              {props.discountedOrdersRemaining != null
                ? t(` · ${props.discountedOrdersRemaining} discounted ${props.discountedOrdersRemaining === 1 ? "order" : "orders"} remaining before checkout`, ` · يتبقى ${props.discountedOrdersRemaining} طلبات مخفضة قبل إتمام الطلب`)
                : ""}
              .
            </p>
          ) : null}
          {props.eventPromotionTitle ? (
            <p className="mt-2 text-[11px] font-medium text-signal-ok">
              {props.eventPromotionTitle}:{" "}
              {props.eventFeeDiscountPercent
                ? t(`${props.eventFeeDiscountPercent}% additional fee discount`, `خصم إضافي ${props.eventFeeDiscountPercent}٪ على الرسوم`)
                : ""}
              {props.eventFeeDiscountPercent &&
              props.eventDeliveryDiscountPercent
                ? " · "
                : ""}
              {props.eventDeliveryDiscountPercent === 100
                ? t("free delivery", "توصيل مجاني")
                : props.eventDeliveryDiscountPercent
                  ? t(`${props.eventDeliveryDiscountPercent}% off delivery`, `خصم ${props.eventDeliveryDiscountPercent}٪ على التوصيل`)
                  : ""}
              .
            </p>
          ) : null}
        </div>
      )}
      {props.showFooter !== false && (
        <p className="mt-2 text-xs text-ink-muted">
          {t(`Follows the live 24K rate of ${formatAed(liveRate24k)}/g, rechecked every ${refreshIntervalSeconds}s`, `يتبع سعر عيار 24 المباشر ${formatAed(liveRate24k)}/غرام، ويُعاد التحقق كل ${refreshIntervalSeconds} ثانية`)} ·{" "}
          {isFresh ? t(`updated ${quoteRecency(ageSeconds)}`, `عُدّل قبل ${Math.max(0, Math.floor(ageSeconds ?? 0))} ثانية`) : t("refreshing now", "جارٍ التحديث الآن")}
        </p>
      )}
    </div>
  );
}

function formatOfferEnd(value: string, arabic = false): string {
  return new Intl.DateTimeFormat(arabic ? "ar-AE" : "en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

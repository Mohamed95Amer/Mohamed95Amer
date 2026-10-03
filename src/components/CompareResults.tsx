"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductImage } from "@/components/ProductImage";
import { useLiveGoldPrice } from "@/components/GoldPriceProvider";
import {
  priceCompareListings, rankCompareListings,
  type CompareCriteria, type CompareListing, type PricedCompareListing,
} from "@/lib/compare/selection";
import { computeGoldHubValueScore } from "@/lib/pricing/value-score";
import { formatAed, goldRateForKarat } from "@/lib/pricing/calc";

type Props = {
  listings: CompareListing[];
  feeBps: number;
  arabic: boolean;
  truncated?: boolean;
} & ({ mode: "smart"; criteria: CompareCriteria; selectedIds?: never } | { mode: "manual"; selectedIds: string[]; criteria?: never });

export function CompareResults(props: Props) {
  // The site-wide provider is the only gold-price subscriber; these cards
  // simply recalculate and re-rank when its shared tick changes.
  const { tick, isFresh, loading } = useLiveGoldPrice();
  const rate = Number(tick?.price_per_gram_24k_aed);
  const rows = useMemo(() => {
    const priced = priceCompareListings(props.listings, rate, props.feeBps, props.mode === "smart" ? props.criteria : undefined);
    return props.mode === "smart" ? rankCompareListings(priced, props.criteria.sort) : priced;
  }, [props.listings, props.feeBps, props.mode, props.criteria, rate]);
  const t = props.arabic ? {
    found: "نتائج من متاجر مختلفة", selected: "قطع مختارة", live: "سعر الذهب المستخدم", no: "لا توجد قطع مطابقة حاليًا",
    noHint: "جرّب ميزانية أعلى أو نطاق وزن أوسع، أو اطلب قطعة من المتاجر.",
    manualHint: "اختر قطعتين على الأقل من صفحات المنتجات للمقارنة جنبًا إلى جنب.",
    stale: "ننتظر سعر ذهب حديثًا قبل عرض ترتيب الأسعار. حاول مرة أخرى بعد لحظات.",
    updating: "جارٍ تحديث سعر الذهب والمقارنة…", limited: "تتضمن المقارنة أحدث 500 قطعة مطابقة فقط. ضيّق المواصفات لضمان ترتيب أدق.",
    firstTotal: "أقل سعر نهائي", firstMaking: "أقل مصنعية", final: "السعر النهائي التقريبي", making: "المصنعية بعد الخصم",
    perGram: "للغرام", gold: "قيمة الذهب", adjustment: "تعديل سعر المتجر", certificate: "شهادة / فحص",
    stones: "الأحجار", service: "رسوم Get Gold", delivery: "التوصيل", vat: "ضريبة القيمة المضافة",
    pickup: "استلام من المتجر", view: "عرض القطعة", different: "القطع تختلف في التصميم والوزن والشهادة؛ أقل سعر لا يعني دائمًا أفضل قيمة. المتجر يؤكد التوفر والسعر النهائي قبل الدفع.",
    stores: "متاجر", under: "ضمن الميزانية", add: "تصفح المنتجات", request: "اطلب قطعة",
  } : {
    found: "Matches across different stores", selected: "Selected pieces", live: "Gold reference", no: "No matching pieces right now",
    noHint: "Try a higher budget or wider weight range, or request a piece from stores.",
    manualHint: "Choose at least two pieces on product pages to compare them side by side.",
    stale: "Waiting for a fresh gold quote before ranking prices. Please try again shortly.",
    updating: "Updating the gold quote and comparison…", limited: "Comparison covers the latest 500 matching listings. Narrow your filters for a more complete ranking.",
    firstTotal: "Lowest final total", firstMaking: "Lowest making charge", final: "Estimated final total", making: "Making after discount",
    perGram: "per gram", gold: "Gold value", adjustment: "Store rate adjustment", certificate: "Certificate / assay",
    stones: "Stones", service: "Get Gold fee", delivery: "Delivery", vat: "VAT",
    pickup: "Store pickup", view: "View piece", different: "Pieces differ in design, weight and certification; the lowest price is not always the best value. The shop confirms availability and final price before payment.",
    stores: "stores", under: "within budget", add: "Browse pieces", request: "Request a piece",
  };

  if (props.mode === "manual" && (props.selectedIds.length < 2 || props.listings.length < 2)) return <div className="card mt-7 p-8 text-center"><p className="font-serif text-xl text-jade-950">{t.manualHint}</p><Link href="/marketplace" className="btn-primary mt-5">{t.add}</Link></div>;
  if (props.listings.length === 0) return <div className="card mt-7 p-8 text-center"><p className="font-serif text-2xl text-jade-950">{t.no}</p><p className="mt-2 text-sm text-ink-muted">{t.noHint}</p><Link href="/requests/new" className="btn-primary mt-5">{t.request}</Link></div>;
  if (loading && !tick) return <div className="card mt-7 p-8 text-sm text-ink-muted" role="status">{t.updating}</div>;
  if (!isFresh || tick?.source === "mock" || tick?.source === "manual" || !Number.isFinite(rate) || rate <= 0) return <div className="card mt-7 border-gold-300/40 bg-gold-50 p-8 text-sm text-gold-700" role="status">{t.stale}</div>;
  if (props.mode === "manual" && rows.length < 2) return <div className="card mt-7 p-8 text-center"><p className="font-serif text-xl text-jade-950">{t.manualHint}</p><Link href="/marketplace" className="btn-primary mt-5">{t.add}</Link></div>;
  if (rows.length === 0) return <div className="card mt-7 p-8 text-center"><p className="font-serif text-2xl text-jade-950">{t.no}</p><p className="mt-2 text-sm text-ink-muted">{t.noHint}</p><Link href="/requests/new" className="btn-primary mt-5">{t.request}</Link></div>;

  return <section className="mt-8" aria-live="polite">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow text-jade-600">{props.mode === "smart" ? t.found : t.selected}</p><h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">{props.mode === "smart" ? `${rows.length} ${t.stores} ${t.under}` : `${rows.length} ${t.selected}`}</h2></div>
      <div className="flex items-center gap-2 text-xs text-ink-muted"><span>{t.live}</span><GoldPriceBadge compact /></div>
    </div>
    {props.truncated && <p className="mt-4 rounded-lg border border-gold-300/40 bg-gold-50 p-3 text-xs text-gold-700">{t.limited}</p>}
    <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row, index) => <CompareCard key={row.listing.id} row={row} first={index === 0 && props.mode === "smart"} firstLabel={props.mode === "smart" && props.criteria.sort === "making" ? t.firstMaking : t.firstTotal} arabic={props.arabic} rate={rate} fulfilment={props.mode === "smart" ? props.criteria.fulfilment : "delivery"} />)}
    </div>
    <p className="mt-5 text-xs leading-6 text-ink-muted">{t.different}</p>
  </section>;
}

function labelsForCard(arabic: boolean) {
  return arabic ? {
    firstTotal: "أقل سعر نهائي", firstMaking: "أقل مصنعية", final: "السعر النهائي التقريبي", making: "المصنعية بعد الخصم", perGram: "للغرام", gold: "قيمة الذهب", adjustment: "تعديل سعر المتجر", certificate: "شهادة / فحص", stones: "الأحجار", service: "رسوم Get Gold", delivery: "التوصيل", vat: "ضريبة القيمة المضافة", pickup: "استلام من المتجر", view: "عرض القطعة",
  } : {
    firstTotal: "Lowest final total", firstMaking: "Lowest making charge", final: "Estimated final total", making: "Making after discount", perGram: "per gram", gold: "Gold value", adjustment: "Store rate adjustment", certificate: "Certificate / assay", stones: "Stones", service: "Get Gold fee", delivery: "Delivery", vat: "VAT", pickup: "Store pickup", view: "View piece",
  };
}

function CompareCard({ row, first, firstLabel, arabic, rate, fulfilment }: { row: PricedCompareListing; first: boolean; firstLabel: string; arabic: boolean; rate: number; fulfilment: "delivery" | "pickup" }) {
  const { listing, breakdown } = row;
  const t = labelsForCard(arabic);
  const score = computeGoldHubValueScore(breakdown, Number(listing.weight_grams));
  const makingPerGram = breakdown.makingCharge / Number(listing.weight_grams);
  return <article className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${first ? "border-gold-400 ring-1 ring-gold-300" : "border-jade-900/10"}`}>
    <div className="relative aspect-[5/4] bg-jade-50"><ProductImage category={listing.category} karat={listing.karat} name={listing.name} images={listing.images} sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw" />{first && <span className="absolute start-3 top-3 rounded-full bg-jade-900 px-3 py-1 text-[10px] font-bold text-white">{firstLabel}</span>}</div>
    <div className="flex flex-1 flex-col p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-jade-700">{listing.vendor.business_name} · {listing.vendor.emirate}</p>
      <h3 className="mt-2 min-h-12 font-serif text-lg font-semibold leading-snug text-jade-950">{listing.name}</h3>
      <p className="mt-1 text-xs text-ink-muted">{listing.karat}K · {Number(listing.weight_grams)}g · {formatAed(goldRateForKarat(rate, listing.karat))}/g</p>
      <div className="mt-4 rounded-xl bg-jade-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-jade-700">{t.final}</p><p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-jade-950">{formatAed(breakdown.unitPriceAed)}</p>{score && <p className="mt-1 text-[11px] text-ink-muted">{arabic ? "تقييم قيمة Get Gold" : "Get Gold Value Score"}: {score.score}/100</p>}</div>
      <dl className="mt-4 space-y-2 text-xs">
        <Metric label={t.gold} value={formatAed(breakdown.goldValueAed)} />
        <Metric label={t.making} value={formatAed(breakdown.makingCharge)} />
        {breakdown.makingChargeDiscountPercent > 0 && <p className="text-[11px] text-jade-700">{breakdown.makingChargeDiscountPercent}% {arabic ? "خصم على المصنعية" : "off making"} · <del>{formatAed(breakdown.makingChargeOriginal)}</del></p>}
        <Metric label={`${t.making} / ${t.perGram}`} value={formatAed(makingPerGram)} />
        {breakdown.vendorRateAdjustmentAed > 0 && <Metric label={t.adjustment} value={formatAed(breakdown.vendorRateAdjustmentAed)} />}
        {breakdown.certificateFee > 0 && <Metric label={t.certificate} value={formatAed(breakdown.certificateFee)} />}
        {breakdown.stoneValue > 0 && <Metric label={t.stones} value={formatAed(breakdown.stoneValue)} />}
        <Metric label={t.service} value={formatAed(breakdown.platformFee)} />
        <Metric label={fulfilment === "pickup" ? t.pickup : t.delivery} value={formatAed(breakdown.deliveryFee)} />
        <Metric label={`${t.vat} (${breakdown.vatRateBps / 100}%)`} value={formatAed(breakdown.vatAed)} />
      </dl>
      <Link href={`/products/${listing.id}`} className="btn-primary mt-5 w-full">{t.view}</Link>
    </div>
  </article>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-ink-muted">{label}</dt><dd className="shrink-0 text-end font-semibold tabular-nums text-jade-950">{value}</dd></div>;
}

"use client";

import { useMemo, useState } from "react";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { KARAT_PURITY, formatAed } from "@/lib/pricing/calc";
import { calculateGoldScenario, formatRecordedDate, formatSignedPercent } from "@/lib/gold-insights";

export interface GoldHistoryPoint {
  recordedOn: string;
  fetchedAt: string;
  rate: number;
  high: number;
  low: number;
  tickCount: number;
  sources: string;
}

export function GoldHistoryExperience({
  history,
  fallbackCurrentRate,
  arabic = false,
}: {
  history: GoldHistoryPoint[];
  fallbackCurrentRate: number;
  arabic?: boolean;
}) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const { tick } = useLiveGoldPrice();
  const currentRate = Number(tick?.price_per_gram_24k_aed ?? fallbackCurrentRate);
  const [grams, setGrams] = useState(10);
  const [karat, setKarat] = useState(24);
  const [selectedDate, setSelectedDate] = useState(history[0]?.recordedOn ?? "");

  const selected = history.find((point) => point.recordedOn === selectedDate) ?? history[0];
  const scenario = useMemo(
    () => calculateGoldScenario(selected?.rate ?? currentRate, currentRate, grams, KARAT_PURITY[karat] ?? 1),
    [selected, currentRate, grams, karat],
  );
  const wentUp = scenario.differenceAed >= 0;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-jade-900/10 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div>
            <p className="eyebrow text-jade-600">{t("Recorded movement", "حركة الأسعار المسجلة")}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">{t("24K price history", "تاريخ سعر عيار 24")}</h2>
          </div>
          <p className="text-xs text-ink-muted">{t("Daily close · AED per gram", "سعر الإغلاق اليومي · درهم لكل غرام")}</p>
        </div>
        <div className="p-4 sm:p-7">
          <MarketTrendChart history={history} arabic={arabic} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="card p-5 sm:p-7">
          <p className="eyebrow text-jade-600">{t("What-if calculator", "حاسبة افتراضية")}</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-jade-950">{t("What would that gold be worth now?", "كم ستبلغ قيمة هذا الذهب الآن؟")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {t("Pick a Get Gold-recorded date, weight and purity. We compare the reference gold value then with the live rate now.", "اختر تاريخاً سجله Get Gold ووزناً وعياراً. نقارن قيمة الذهب المرجعية حينها بسعره المباشر الآن.")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2" htmlFor="history-date">
              <span className="label">{t("Recorded date", "التاريخ المسجل")}</span>
              <select id="history-date" name="history_date" className="input" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
                {history.map((point) => (
                  <option key={point.recordedOn} value={point.recordedOn}>
                    {formatRecordedDate(point.recordedOn)} · {formatAed(point.rate)}{t("/g", "/غ")} · {point.sources}
                  </option>
                ))}
              </select>
              {selected && (
                <span className="mt-2 block text-[11px] text-ink-muted">
                  {selected.tickCount.toLocaleString(arabic ? "ar-AE" : "en-AE")} {t("usable quotes that day · source", "أسعار صالحة في ذلك اليوم · المصدر")} {selected.sources}
                </span>
              )}
            </label>
            <label htmlFor="history-weight">
              <span className="label">{t("Gold weight", "وزن الذهب")}</span>
              <div className="relative">
                <input
                  id="history-weight"
                  name="gold_weight"
                  className="input pe-10 tabular-nums"
                  type="number"
                  min="0.1"
                  max="10000"
                  step="0.1"
                  value={grams}
                  onChange={(event) => setGrams(Math.max(0, Number(event.target.value)))}
                />
                <span className="pointer-events-none absolute end-3 top-4 text-xs text-ink-muted">{t("g", "غ")}</span>
              </div>
            </label>
            <label htmlFor="history-karat">
              <span className="label">{t("Purity", "العيار")}</span>
              <select id="history-karat" name="karat" className="input" value={karat} onChange={(event) => setKarat(Number(event.target.value))}>
                {[24, 22, 21, 18].map((value) => <option key={value} value={value}>{arabic ? `عيار ${value}` : `${value}K`}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-jade-950 p-6 text-white shadow-lift sm:p-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-gold-300/20" />
          <p className="eyebrow relative text-gold-200">{t("Illustrative result", "نتيجة توضيحية")}</p>
          <div className="relative mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-white/50">{t("Gold value on", "قيمة الذهب في")} {selected ? formatRecordedDate(selected.recordedOn) : t("selected date", "التاريخ المحدد")}</p>
              <p className="mt-1 font-serif text-2xl tabular-nums">{formatAed(scenario.historicalValueAed)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">{t("Market-linked value now", "القيمة حسب السوق الآن")}</p>
              <p className="mt-1 font-serif text-2xl tabular-nums text-gold-200">{formatAed(scenario.currentValueAed)}</p>
            </div>
          </div>
          <div className={`relative mt-6 rounded-2xl border p-5 ${wentUp ? "border-jade-300/20 bg-jade-500/15" : "border-gold-300/20 bg-gold-300/10"}`}>
            <p className="text-xs text-white/55">{t("Change at the current 24K reference", "التغير وفق السعر المرجعي الحالي لعيار 24")}</p>
            <p className="mt-1 font-serif text-3xl font-semibold tabular-nums">
              {scenario.differenceAed > 0 ? "+" : ""}{formatAed(scenario.differenceAed)}
            </p>
            <p className="mt-1 text-sm text-white/65">
              {formatSignedPercent(scenario.changePercent)} · {wentUp ? t("higher than the recorded value", "أعلى من القيمة المسجلة") : t("lower than the recorded value", "أقل من القيمة المسجلة")}
            </p>
          </div>
          <p className="relative mt-5 text-[11px] leading-relaxed text-white/45">
            {t("Gold reference value only. Excludes making charges, stones, premiums, fees and resale spreads. Not financial advice.", "قيمة مرجعية للذهب فقط. لا تشمل المصنعية أو الأحجار أو الرسوم أو فروق إعادة البيع. ليست نصيحة مالية.")}
          </p>
        </div>
      </section>

      <section className="card p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-jade-600">{t("Purity lens", "مقارنة العيارات")}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">{t("Today’s gold value per 10 grams", "قيمة 10 غرامات ذهب اليوم")}</h2>
          </div>
          <p className="text-xs text-ink-muted">{t("Before making, stones, premium or fees", "قبل المصنعية والأحجار والرسوم")}</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[24, 22, 21, 18].map((value) => {
            const purity = KARAT_PURITY[value];
            return (
              <div key={value} className="rounded-2xl border border-jade-900/10 bg-jade-50/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-2xl font-semibold text-jade-950">{arabic ? `عيار ${value}` : `${value}K`}</span>
                  <span className="text-xs text-ink-muted">{arabic ? `نقاء ${(purity * 100).toFixed(1)}%` : `${(purity * 100).toFixed(1)}% pure`}</span>
                </div>
                <p className="mt-4 text-lg font-semibold tabular-nums text-jade-800">{formatAed(currentRate * purity * 10)}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-jade-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-jade-500 to-gold-300" style={{ width: `${purity * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MarketTrendChart({ history, arabic = false }: { history: GoldHistoryPoint[]; arabic?: boolean }) {
  if (history.length === 0) {
    return <div className="grid h-64 place-items-center rounded-2xl bg-jade-50 text-sm text-ink-muted">{arabic ? "يبدأ السجل مع السعر المباشر التالي." : "History starts with the next live quote."}</div>;
  }

  const width = 760;
  const height = 250;
  const padX = 28;
  const padY = 28;
  const rates = history.map((point) => point.rate);
  const rawMin = Math.min(...history.map((point) => point.low));
  const rawMax = Math.max(...history.map((point) => point.high));
  const spread = Math.max(1, rawMax - rawMin);
  const min = rawMin - spread * 0.12;
  const max = rawMax + spread * 0.12;
  const times = history.map((point) => new Date(point.fetchedAt).getTime());
  const firstTime = Math.min(...times);
  const timeSpan = Math.max(1, Math.max(...times) - firstTime);
  const x = (time: number, index: number) => history.length === 1
    ? width / 2
    : padX + ((time - firstTime) / timeSpan || index / (history.length - 1)) * (width - padX * 2);
  const y = (rate: number) => padY + ((max - rate) / (max - min)) * (height - padY * 2);
  const coordinates = history.map((point, index) => [x(times[index], index), y(point.rate)] as const);
  const path = coordinates.map(([cx, cy], index) => `${index === 0 ? "M" : "L"} ${cx.toFixed(1)} ${cy.toFixed(1)}`).join(" ");
  const area = `${path} L ${coordinates.at(-1)?.[0] ?? padX} ${height - padY} L ${coordinates[0][0]} ${height - padY} Z`;
  const firstRate = rates[0];
  const lastRate = rates.at(-1) ?? firstRate;
  const change = firstRate > 0 ? ((lastRate / firstRate) - 1) * 100 : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-muted">{arabic ? "آخر سعر إغلاق يومي" : "Latest daily close"}</p>
          <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-jade-950">{formatAed(lastRate)}<span className="ms-1 text-sm font-normal text-ink-muted">{arabic ? "/غ" : "/g"}</span></p>
        </div>
        <span className={`pill ${change >= 0 ? "border-signal-ok/20 bg-signal-ok/10 text-signal-ok" : "border-gold-400/20 bg-gold-50 text-gold-600"}`}>
          {formatSignedPercent(change)} {arabic ? "خلال الأيام المسجلة" : "across recorded days"}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-jade-900/10 bg-gradient-to-b from-jade-50/80 to-white p-2 sm:p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={arabic ? `تاريخ سعر الذهب من ${formatAed(firstRate)} إلى ${formatAed(lastRate)} لكل غرام` : `Gold price history from ${formatAed(firstRate)} to ${formatAed(lastRate)} per gram`}>
          <defs>
            <linearGradient id="gold-history-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#45A181" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#45A181" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1={padX} x2={width - padX} y1={height * fraction} y2={height * fraction} stroke="#D8EEE5" strokeDasharray="4 7" />)}
          <path d={area} fill="url(#gold-history-fill)" />
          <path d={path} fill="none" stroke="#17654F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {coordinates.map(([cx, cy], index) => (
            <g key={history[index].recordedOn}>
              <circle cx={cx} cy={cy} r="6" fill="#FCFAF5" stroke="#D69B2D" strokeWidth="4" />
              <title>{`${formatRecordedDate(history[index].recordedOn)} · ${formatAed(history[index].rate)}${arabic ? "/غ" : "/g"} · ${history[index].tickCount} ${arabic ? "أسعار" : "quotes"} · ${history[index].sources}`}</title>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-ink-muted">
        <span>{formatRecordedDate(history[0].recordedOn)}</span>
        <span>{formatRecordedDate(history.at(-1)?.recordedOn ?? history[0].recordedOn)}</span>
      </div>
    </div>
  );
}

/**
 * Public "gold rate today" pages. Pure helpers only (no server imports) so the
 * maths and copy can be unit-tested and reused by the alert cron.
 *
 * These pages quote the international spot-derived rate at the statutory UAE
 * hallmark fineness (999/916/875/750). Catalogue prices deliberately use the
 * vendor-reported working fineness in src/lib/pricing/calc.ts instead; the
 * public rate page must match the standard figures shoppers compare against.
 */

export type RateLocale = "en" | "ar";

export const RATE_KARATS = [
  { slug: "24k", karat: 24, fineness: 999, purity: 1 },
  { slug: "22k", karat: 22, fineness: 916, purity: 0.916 },
  { slug: "21k", karat: 21, fineness: 875, purity: 0.875 },
  { slug: "18k", karat: 18, fineness: 750, purity: 0.75 },
] as const;

export type RateKarat = (typeof RATE_KARATS)[number];
export type RateKaratSlug = RateKarat["slug"];

export function rateKaratBySlug(slug: string): RateKarat | null {
  return RATE_KARATS.find((item) => item.slug === slug.toLowerCase()) ?? null;
}

export function rateKaratByKarat(karat: number): RateKarat | null {
  return RATE_KARATS.find((item) => item.karat === karat) ?? null;
}

export const TOLA_GRAMS = 11.6638;
export const TROY_OUNCE_GRAMS = 31.1034768;

export const RATE_WEIGHTS = [
  { id: "1g", grams: 1, en: "1 gram", ar: "1 غرام" },
  { id: "4g", grams: 4, en: "4 grams", ar: "4 غرامات" },
  { id: "8g", grams: 8, en: "8 grams", ar: "8 غرامات" },
  { id: "10g", grams: 10, en: "10 grams", ar: "10 غرامات" },
  { id: "tola", grams: TOLA_GRAMS, en: "1 tola (11.66 g)", ar: "1 تولة (11.66 غ)" },
  { id: "oz", grams: TROY_OUNCE_GRAMS, en: "1 troy ounce (31.10 g)", ar: "1 أونصة (31.10 غ)" },
] as const;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The 24K tick is the spot-equivalent AED/g figure that UAE rate tables quote
 * as 24K. Lower karats are that figure times their statutory fineness.
 */
export function karatRatePerGram(pricePerGram24kAed: number, karat: RateKarat): number {
  if (!Number.isFinite(pricePerGram24kAed) || pricePerGram24kAed <= 0) return 0;
  return round2(pricePerGram24kAed * karat.purity);
}

export function weightPrice(ratePerGram: number, grams: number): number {
  return round2(ratePerGram * grams);
}

export interface DailyClose {
  /** YYYY-MM-DD */
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface RateSummary {
  current: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  todayHigh: number | null;
  todayLow: number | null;
  weekChangePercent: number | null;
  monthChangePercent: number | null;
  monthHigh: number | null;
  monthLow: number | null;
  direction: "up" | "down" | "flat" | "unknown";
}

/**
 * Builds the numbers behind the daily summary for one karat. `history` is the
 * 24K daily history (ascending by day); `today` is the Dubai date of the
 * current quote so a partially recorded day is treated as "today".
 */
export function summarizeKaratRate(
  history: DailyClose[],
  current24k: number,
  karat: RateKarat,
  today: string,
): RateSummary {
  const scale = (value: number) => karatRatePerGram(value, karat);
  const current = scale(current24k);
  const ordered = [...history].filter((row) => row.close > 0).sort((a, b) => a.day.localeCompare(b.day));
  const todayRow = ordered.find((row) => row.day === today) ?? null;
  const before = ordered.filter((row) => row.day < today);
  const previous = before.at(-1) ?? null;
  const previousClose = previous ? scale(previous.close) : null;
  const change = previousClose != null && current > 0 ? round2(current - previousClose) : null;
  const pct = (from: number | null) => (from != null && from > 0 && current > 0 ? round2(((current / from) - 1) * 100) : null);
  const closeOnOrBefore = (daysAgo: number) => {
    const cutoff = shiftIsoDay(today, -daysAgo);
    const row = [...before].reverse().find((item) => item.day <= cutoff);
    return row ? scale(row.close) : null;
  };
  const monthCutoff = shiftIsoDay(today, -30);
  const month = ordered.filter((row) => row.day >= monthCutoff);
  const todayHigh = todayRow ? Math.max(scale(todayRow.high), current) : null;
  const todayLow = todayRow ? Math.min(scale(todayRow.low), current || Infinity) : null;
  const changePercent = pct(previousClose);
  const direction: RateSummary["direction"] = changePercent == null ? "unknown" : Math.abs(changePercent) < 0.05 ? "flat" : changePercent > 0 ? "up" : "down";
  return {
    current,
    previousClose,
    change,
    changePercent,
    todayHigh,
    todayLow: todayLow === Infinity ? null : todayLow,
    weekChangePercent: pct(closeOnOrBefore(7)),
    monthChangePercent: pct(closeOnOrBefore(30)),
    monthHigh: month.length ? Math.max(...month.map((row) => scale(row.high)), current) : null,
    monthLow: month.length ? Math.min(...month.map((row) => scale(row.low))) : null,
    direction,
  };
}

export function shiftIsoDay(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatRateAed(value: number, locale: RateLocale): string {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return locale === "ar" ? `${formatted} درهم` : `AED ${formatted}`;
}

export function formatSignedPct(value: number | null, locale: RateLocale): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const body = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${sign}${body}%`;
}

/** One-paragraph, factual daily summary. No forecasts or advice. */
export function dailySummaryText(summary: RateSummary, karat: RateKarat, locale: RateLocale, dateLabel: string): string {
  const k = karat.karat;
  const rate = formatRateAed(summary.current, locale);
  if (locale === "ar") {
    const parts = [`سعر غرام الذهب عيار ${k} في الإمارات اليوم ${dateLabel} هو ${rate} تقريباً وفق السعر المرجعي العالمي.`];
    if (summary.change != null && summary.previousClose != null) {
      if (summary.direction === "flat") parts.push(`السعر شبه مستقر مقارنة بإغلاق أمس (${formatRateAed(summary.previousClose, locale)}).`);
      else parts.push(`${summary.direction === "up" ? "ارتفع" : "انخفض"} بمقدار ${formatRateAed(Math.abs(summary.change), locale)} (${formatSignedPct(summary.changePercent, locale)}) مقارنة بإغلاق أمس البالغ ${formatRateAed(summary.previousClose, locale)}.`);
    }
    if (summary.todayHigh != null && summary.todayLow != null) parts.push(`تراوح السعر اليوم بين ${formatRateAed(summary.todayLow, locale)} و${formatRateAed(summary.todayHigh, locale)}.`);
    if (summary.weekChangePercent != null) parts.push(`التغير خلال 7 أيام: ${formatSignedPct(summary.weekChangePercent, locale)}.`);
    if (summary.monthChangePercent != null) parts.push(`وخلال 30 يوماً: ${formatSignedPct(summary.monthChangePercent, locale)}.`);
    parts.push("السعر لا يشمل المصنعية أو ضريبة القيمة المضافة، ويؤكد المحل السعر النهائي.");
    return parts.join(" ");
  }
  const parts = [`The ${k}K gold rate in the UAE on ${dateLabel} is about ${rate} per gram, based on the international reference price.`];
  if (summary.change != null && summary.previousClose != null) {
    if (summary.direction === "flat") parts.push(`That is almost unchanged from yesterday's close of ${formatRateAed(summary.previousClose, locale)}.`);
    else parts.push(`It is ${summary.direction === "up" ? "up" : "down"} ${formatRateAed(Math.abs(summary.change), locale)} (${formatSignedPct(summary.changePercent, locale)}) from yesterday's close of ${formatRateAed(summary.previousClose, locale)}.`);
  }
  if (summary.todayHigh != null && summary.todayLow != null) parts.push(`Today's range so far: ${formatRateAed(summary.todayLow, locale)} to ${formatRateAed(summary.todayHigh, locale)}.`);
  if (summary.weekChangePercent != null) parts.push(`7-day change: ${formatSignedPct(summary.weekChangePercent, locale)}.`);
  if (summary.monthChangePercent != null) parts.push(`30-day change: ${formatSignedPct(summary.monthChangePercent, locale)}.`);
  parts.push("The rate excludes making charges and VAT; the store confirms the final price.");
  return parts.join(" ");
}

export function ratePath(locale: RateLocale, slug?: RateKaratSlug): string {
  const base = locale === "ar" ? "/ar/gold-rate" : "/gold-rate";
  return slug ? `${base}/${slug}` : base;
}

export function twinRatePath(pathname: string): string | null {
  const match = pathname.match(/^(\/ar)?\/gold-rate(\/(24k|22k|21k|18k))?\/?$/);
  if (!match) return null;
  const slug = match[3] as RateKaratSlug | undefined;
  return ratePath(match[1] ? "en" : "ar", slug);
}

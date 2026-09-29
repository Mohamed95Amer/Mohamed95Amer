import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { GoldHistoryExperience, type GoldHistoryPoint } from "@/components/GoldHistoryExperience";
import { env } from "@/lib/env";
import { getLatestTick } from "@/lib/gold-price/service";
import { formatDubaiDate, formatSignedPercent } from "@/lib/gold-insights";
import { formatAed } from "@/lib/pricing/calc";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gold price insights",
  description: "Explore Get Gold's recorded 24K UAE gold reference, daily movement and historical value scenarios.",
  alternates: { canonical: "/live-price" },
};

interface DailyHistoryRow {
  recorded_on: string;
  last_fetched_at: string;
  tick_count: number | string;
  high_price_aed: number | string;
  low_price_aed: number | string;
  close_price_aed: number | string;
  sources: string;
}

export default async function LivePricePage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const supabase = getServiceSupabase();
  const [{ data: dailyRows }, latestTick] = await Promise.all([
    supabase
      .from("gold_price_daily_history")
      .select("recorded_on, last_fetched_at, tick_count, high_price_aed, low_price_aed, close_price_aed, sources")
      .order("recorded_on", { ascending: true })
      .limit(366),
    getLatestTick(),
  ]);

  const history: GoldHistoryPoint[] = ((dailyRows ?? []) as DailyHistoryRow[]).map((row) => ({
    recordedOn: row.recorded_on,
    fetchedAt: row.last_fetched_at,
    rate: Number(row.close_price_aed),
    high: Number(row.high_price_aed),
    low: Number(row.low_price_aed),
    tickCount: Number(row.tick_count),
    sources: row.sources,
  }));
  const currentRate = Number(latestTick?.price_per_gram_24k_aed ?? history.at(-1)?.rate ?? 0);
  const firstRate = history[0]?.rate ?? currentRate;
  const changeSinceFirst = firstRate > 0 ? ((currentRate / firstRate) - 1) * 100 : 0;
  const low = history.length ? Math.min(...history.map((point) => point.low)) : currentRate;
  const high = history.length ? Math.max(...history.map((point) => point.high)) : currentRate;
  const quoteCount = history.reduce((sum, point) => sum + point.tickCount, 0);
  const firstDate = history[0]?.fetchedAt;
  const refreshSeconds = env.refreshIntervalSeconds();
  const staleSeconds = env.stalePriceSeconds();

  return (
    <div dir={arabic ? "rtl" : "ltr"}>
      <section className="relative overflow-hidden bg-jade-950 text-white">
        <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full border border-gold-300/20" />
        <div className="absolute bottom-0 left-1/4 h-48 w-96 rounded-full bg-jade-500/15 blur-3xl" />
        <div className="container-pro relative py-14 sm:py-20">
          <div className="max-w-3xl">
            <p className="eyebrow text-gold-200">{t("Gold market intelligence", "رؤية أسعار الذهب")}</p>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              {t("See what gold did.", "تابع تغير أسعار الذهب.")}<br /><span className="text-gold-200">{t("Explore what it means for you.", "واكتشف ما يعنيه ذلك لك.")}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65">
              {t("Follow Get Gold’s recorded UAE reference rate, compare purity values, and test a historical purchase against today’s live market.", "تابع السعر المرجعي المسجل لدى Get Gold في الإمارات، وقارن العيارات، واختبر قيمة شراء افتراضي سابق وفق سعر السوق اليوم.")}
            </p>
            <div className="mt-7"><GoldPriceBadge tone="dark" arabic={arabic} /></div>
          </div>
        </div>
      </section>

      <div className="container-pro py-10 sm:py-14">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InsightStat label={t("Live 24K reference", "السعر المرجعي المباشر لعيار 24")} value={`${formatAed(currentRate)}${t("/g", "/غ")}`} detail={t(`Rechecked every ${refreshSeconds}s`, `يُعاد التحقق كل ${refreshSeconds} ثوانٍ`)} />
          <InsightStat
            label={t("Since first recorded day", "منذ أول يوم مسجل")}
            value={formatSignedPercent(changeSinceFirst)}
            detail={firstDate ? `${t("From", "منذ")} ${formatDubaiDate(firstDate)}` : t("History begins with the next quote", "يبدأ السجل مع السعر التالي")}
            tone={changeSinceFirst >= 0 ? "positive" : "warm"}
          />
          <InsightStat label={t("Recorded range", "النطاق المسجل")} value={`${formatAed(low)} – ${formatAed(high)}`} detail={t("Lowest to highest 24K rate", "من أدنى إلى أعلى سعر لعيار 24")} />
          <InsightStat label={t("Coverage", "التغطية")} value={arabic ? `${history.length} أيام مسجلة` : `${history.length} recorded ${history.length === 1 ? "day" : "days"}`} detail={arabic ? `${quoteCount.toLocaleString("ar-AE")} أسعار سوق صالحة` : `${quoteCount.toLocaleString("en-AE")} usable market quotes`} />
        </section>

        <div className="mt-6 rounded-2xl border border-jade-900/10 bg-jade-50 px-5 py-4 text-sm leading-relaxed text-ink-muted">
          <strong className="font-semibold text-jade-900">{t("Fresh-price protection:", "حماية السعر الحديث:")}</strong>{" "}
          {arabic ? `يعيد Get Gold التحقق كل ${refreshSeconds} ثوانٍ. إذا بلغ عمر السعر الأخير ${staleSeconds} ثانية، تتوقف طلبات الشراء حتى يصل سعر حديث. يتضمن السجل أدناه الأسعار الصالحة التي سجلها Get Gold فقط؛ والفجوات تعني عدم تسجيل الخدمة للبيانات، لا ثبات السوق.` : `Get Gold rechecks every ${refreshSeconds} seconds. If the latest quote reaches ${staleSeconds} seconds old, purchase requests pause until a fresh rate arrives. History below contains only usable quotes recorded by Get Gold; gaps mean the service was not recording, not that the market was unchanged.`}
        </div>

        <div className="mt-8">
          <GoldHistoryExperience history={history} fallbackCurrentRate={currentRate} arabic={arabic} />
        </div>
      </div>
    </div>
  );
}

function InsightStat({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "warm";
}) {
  const valueTone = tone === "positive" ? "text-signal-ok" : tone === "warm" ? "text-gold-600" : "text-jade-950";
  return (
    <div className="card p-5">
      <p className="label">{label}</p>
      <p className={`mt-3 font-serif text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

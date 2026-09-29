import { formatAed } from "@/lib/pricing/calc";
import {
  formatValuePercent,
  type GoldHubValueScore as ValueScore,
} from "@/lib/pricing/value-score";

interface Props {
  value: ValueScore;
  compact?: boolean;
  arabic?: boolean;
}

export function GoldHubValueScore({ value, compact = false, arabic = false }: Props) {
  const accent = scoreAccent(value.score);
  const label = arabic ? value.score >= 90 ? "قيمة ممتازة" : value.score >= 80 ? "قيمة قوية" : value.score >= 70 ? "قيمة متوازنة" : "تكاليف إضافية أعلى" : value.label;

  if (compact) {
    return (
      <div
        className="mt-3 rounded-xl border border-gold-300/40 bg-gold-50/70 px-3 py-2.5"
        aria-label={arabic ? `درجة قيمة Get Gold ${value.score} من 100. ${label}.` : `Get Gold Value Score ${value.score} out of 100. ${value.label}.`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-600">
            {arabic ? "قيمة Get Gold" : "Get Gold Value"}
          </span>
          <span className="text-sm font-bold tabular-nums text-jade-950">
            {value.score}<span className="text-[10px] font-semibold text-ink-muted">/100</span>
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-jade-900/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value.score}
        >
          <div className={`h-full rounded-full ${accent.bar}`} style={{ width: `${value.score}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-ink-muted">
          <span className={`font-semibold ${accent.text}`}>{label}</span>
          {" · "}{arabic ? `${formatValuePercent(value.premiumPercent)}% فوق قيمة الذهب` : `${formatValuePercent(value.premiumPercent)}% above gold value`}
        </p>
      </div>
    );
  }

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-gold-300/40 bg-gradient-to-br from-gold-50 to-white">
      <div className="flex items-center gap-4 p-4">
        <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 ${accent.ring} bg-white shadow-sm`}>
          <span className="text-2xl font-bold leading-none tabular-nums text-jade-950">{value.score}</span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-muted">{arabic ? "من 100" : "of 100"}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold-600">
            {arabic ? "درجة قيمة Get Gold" : "Get Gold Value Score"}
          </p>
          <p className={`mt-1 font-serif text-xl font-semibold ${accent.text}`}>{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {arabic ? `${formatValuePercent(value.premiumPercent)}% تكاليف قابلة للمقارنة فوق قيمة الذهب اليوم.` : `${formatValuePercent(value.premiumPercent)}% in comparable costs above today's gold value.`}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 border-t border-gold-300/30 bg-white/65 text-sm">
        <div className="border-r border-gold-300/30 p-3.5">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{arabic ? "تكاليف فوق قيمة الذهب" : "Premium above gold"}</dt>
          <dd className="mt-1 font-semibold tabular-nums text-jade-950">{formatAed(value.premiumAboveGoldAed)}</dd>
        </div>
        <div className="p-3.5">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{arabic ? "التكلفة لكل غرام شاملة الذهب" : "Gold-inclusive cost"}</dt>
          <dd className="mt-1 font-semibold tabular-nums text-jade-950">{formatAed(value.effectivePricePerGramAed)}{arabic ? "/غ" : "/g"}</dd>
        </div>
      </dl>

      <details className="group border-t border-gold-300/30 bg-white/45 px-4 py-3 text-xs text-ink-muted">
        <summary className="cursor-pointer font-semibold text-jade-700 marker:text-gold-500">
          {arabic ? "كيف تُحسب الدرجة؟" : "How is this calculated?"}
        </summary>
        <p className="mt-2 leading-relaxed">
          {arabic ? "تبدأ الدرجة من 100 وتُخصم منها نسبة المصنعية الفعلية ورسوم الشهادة أو الفحص ورسوم Get Gold. تظهر تكاليف التوصيل والأحجار المسعّرة منفصلة في تفاصيل السعر، لكنها لا تدخل في المقارنة بين قطع الذهب. الدرجة تقارن شفافية السعر، ولا تقيس جودة الصناعة أو قيمة إعادة البيع أو أداء الاستثمار." : "The score starts at 100 and subtracts the percentage added by effective making, certificate or assay and the Get Gold fee. Delivery and separately priced stones are shown in the breakdown but excluded for a fair gold-to-gold comparison. It compares price transparency, not craftsmanship, resale value or investment performance."}
        </p>
      </details>
    </section>
  );
}

function scoreAccent(score: number) {
  if (score >= 90) {
    return { bar: "bg-signal-ok", ring: "border-signal-ok/75", text: "text-signal-ok" };
  }
  if (score >= 80) {
    return { bar: "bg-jade-500", ring: "border-jade-400", text: "text-jade-700" };
  }
  if (score >= 70) {
    return { bar: "bg-gold-400", ring: "border-gold-300", text: "text-gold-600" };
  }
  return { bar: "bg-signal-warn", ring: "border-signal-warn/65", text: "text-signal-warn" };
}

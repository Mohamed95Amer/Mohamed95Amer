import Link from "next/link";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { RateAlertForm } from "@/components/gold-rate/RateAlertForm";
import {
  RATE_KARATS,
  RATE_WEIGHTS,
  dailySummaryText,
  formatRateAed,
  formatSignedPct,
  karatRatePerGram,
  ratePath,
  summarizeKaratRate,
  weightPrice,
  type RateKarat,
  type RateLocale,
} from "@/lib/gold-rate/core";
import type { RateSnapshot } from "@/lib/gold-rate/data";
import { serializeJsonLd } from "@/lib/security/json-ld";
import { env } from "@/lib/env";

const tr = (locale: RateLocale) => (en: string, ar: string) => (locale === "ar" ? ar : en);

function dubaiDate(value: string | null, locale: RateLocale, withTime = false) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function karatTitle(karat: RateKarat, locale: RateLocale) {
  return locale === "ar"
    ? `سعر الذهب عيار ${karat.karat} اليوم في دبي والإمارات`
    : `${karat.karat}K Gold Rate Today in Dubai & UAE`;
}

export function karatDescription(karat: RateKarat, locale: RateLocale) {
  return locale === "ar"
    ? `سعر غرام الذهب عيار ${karat.karat} اليوم في الإمارات بالدرهم، مع سعر التولة و10 غرامات، وملخص يومي للتغير، ومقارنة المصنعية بين المحلات الموثّقة.`
    : `Today's ${karat.karat}K gold rate per gram in AED in Dubai and the UAE, with tola and 10 g prices, a daily price summary, and making-charge comparisons across verified stores.`;
}

function faq(karat: RateKarat | null, locale: RateLocale, ratePerGram: number) {
  const t = tr(locale);
  const k = karat?.karat ?? 22;
  const items: { q: string; a: string }[] = [
    {
      q: t(`What is the ${k}K gold rate today in Dubai?`, `كم سعر الذهب عيار ${k} اليوم في دبي؟`),
      a: t(
        `Based on the international reference price, ${k}K gold is about ${formatRateAed(ratePerGram, locale)} per gram right now. Shop prices add a making charge and 5% VAT.`,
        `وفق السعر المرجعي العالمي، يبلغ سعر غرام الذهب عيار ${k} حالياً حوالي ${formatRateAed(ratePerGram, locale)}. تضيف المحلات المصنعية وضريبة القيمة المضافة 5٪.`,
      ),
    },
    {
      q: t("Why is the shop price higher than the gold rate?", "لماذا سعر المحل أعلى من سعر الذهب؟"),
      a: t(
        "A piece's price is the gold value (weight × rate for its karat) plus the store's making charge, any stones, and VAT. Making charges differ between stores, which is why comparing them saves money.",
        "سعر القطعة هو قيمة الذهب (الوزن × سعر العيار) مضافاً إليها مصنعية المحل والأحجار إن وجدت وضريبة القيمة المضافة. تختلف المصنعية من محل لآخر، لذلك تساعدك المقارنة على التوفير.",
      ),
    },
    {
      q: t("How often is this rate updated?", "كم مرة يتم تحديث السعر؟"),
      a: t(
        "Get Gold rechecks the international gold price continuously during the day. The daily summary compares the current rate with the previous day's close.",
        "يعيد Get Gold التحقق من سعر الذهب العالمي باستمرار خلال اليوم، ويقارن الملخص اليومي السعر الحالي بإغلاق اليوم السابق.",
      ),
    },
    {
      q: t("What do 24K, 22K, 21K and 18K mean?", "ماذا تعني عيارات 24 و22 و21 و18؟"),
      a: t(
        "Karat measures purity: 24K is 99.9% gold, 22K is 91.6%, 21K is 87.5% and 18K is 75%. Lower karats are harder and more common in everyday jewellery.",
        "العيار يقيس نقاء الذهب: عيار 24 يعني 99.9٪ ذهب، و22 يعني 91.6٪، و21 يعني 87.5٪، و18 يعني 75٪. العيارات الأقل أكثر صلابة وشائعة في المجوهرات اليومية.",
      ),
    },
    {
      q: t("How much is 1 tola of gold?", "كم وزن التولة؟"),
      a: t(
        `One tola is 11.66 grams. At today's rate, 1 tola of ${k}K gold is about ${formatRateAed(weightPrice(ratePerGram, 11.6638), locale)} before making charges and VAT.`,
        `التولة تساوي 11.66 غراماً. بسعر اليوم، تبلغ قيمة تولة الذهب عيار ${k} حوالي ${formatRateAed(weightPrice(ratePerGram, 11.6638), locale)} قبل المصنعية والضريبة.`,
      ),
    },
  ];
  return items;
}

function JsonLd({ value }: { value: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }} />;
}

function Breadcrumbs({ locale, karat }: { locale: RateLocale; karat: RateKarat | null }) {
  const t = tr(locale);
  const base = env.siteUrl();
  const crumbs = [
    { name: t("Home", "الرئيسية"), href: "/" },
    { name: t("Gold rate today", "سعر الذهب اليوم"), href: ratePath(locale) },
    ...(karat ? [{ name: t(`${karat.karat}K`, `عيار ${karat.karat}`), href: ratePath(locale, karat.slug) }] : []),
  ];
  return (
    <>
      <JsonLd value={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: `${base}${crumb.href}` })),
      }} />
      <nav aria-label={t("Breadcrumb", "مسار التنقل")} className="text-xs text-white/60">
        {crumbs.map((crumb, index) => (
          <span key={crumb.href}>
            {index > 0 && <span className="mx-1.5">/</span>}
            {index === crumbs.length - 1 ? <span className="text-white/85">{crumb.name}</span> : <Link className="hover:text-gold-200" href={crumb.href}>{crumb.name}</Link>}
          </span>
        ))}
      </nav>
    </>
  );
}

function Stat({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: "default" | "up" | "down" }) {
  const color = tone === "up" ? "text-signal-ok" : tone === "down" ? "text-gold-600" : "text-jade-950";
  return (
    <div className="card p-5">
      <p className="label">{label}</p>
      <p className={`mt-2 font-serif text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-ink-muted">{detail}</p>}
    </div>
  );
}

function FaqSection({ items, locale }: { items: { q: string; a: string }[]; locale: RateLocale }) {
  return (
    <section className="mt-12">
      <JsonLd value={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
      }} />
      <h2 className="font-serif text-2xl text-jade-950 sm:text-3xl">{tr(locale)("Frequently asked questions", "أسئلة شائعة")}</h2>
      <div className="mt-5 divide-y divide-jade-900/10 rounded-2xl border border-jade-900/10 bg-white">
        {items.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="cursor-pointer list-none font-semibold text-jade-950">{item.q}</summary>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function OtherKarats({ locale, price24k, current }: { locale: RateLocale; price24k: number; current: RateKarat | null }) {
  const t = tr(locale);
  return (
    <section className="mt-12">
      <h2 className="font-serif text-2xl text-jade-950 sm:text-3xl">{current ? t("Other karats today", "عيارات أخرى اليوم") : t("Gold rate by karat", "سعر الذهب حسب العيار")}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RATE_KARATS.map((item) => (
          <Link
            key={item.slug}
            href={ratePath(locale, item.slug)}
            aria-current={current?.slug === item.slug ? "page" : undefined}
            className={`card block p-5 transition hover:border-gold-300 ${current?.slug === item.slug ? "ring-2 ring-gold-300" : ""}`}
          >
            <p className="label">{t(`${item.karat}K gold · ${item.fineness}`, `ذهب عيار ${item.karat} · ${item.fineness}`)}</p>
            <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-jade-950">{formatRateAed(karatRatePerGram(price24k, item), locale)}</p>
            <p className="mt-1 text-xs text-ink-muted">{t("per gram · view details →", "للغرام · التفاصيل ←")}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Hero({ locale, karat, title, children }: { locale: RateLocale; karat: RateKarat | null; title: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-jade-950 text-white">
      <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full border border-gold-300/20" />
      <div className="container-pro relative py-10 sm:py-14">
        <Breadcrumbs locale={locale} karat={karat} />
        <h1 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        {children}
      </div>
    </section>
  );
}

export function KaratRateView({ locale, karat, snapshot }: { locale: RateLocale; karat: RateKarat; snapshot: RateSnapshot }) {
  const t = tr(locale);
  const summary = summarizeKaratRate(snapshot.history, snapshot.price24k, karat, snapshot.today);
  const dateLabel = dubaiDate(snapshot.fetchedAt, locale);
  const updated = snapshot.fetchedAt ? dubaiDate(snapshot.fetchedAt, locale, true) : "—";
  const trend = summary.direction === "up" ? "up" : summary.direction === "down" ? "down" : "default";
  const recent = [...snapshot.history].filter((row) => row.day < snapshot.today).slice(-7).reverse();
  const compareHref = `/marketplace?karat=${karat.karat}&sort=value`;
  const available = summary.current > 0;
  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <Hero locale={locale} karat={karat} title={karatTitle(karat, locale)}>
        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-sm text-white/60">{t(`${karat.karat}K gold · price per gram`, `ذهب عيار ${karat.karat} · سعر الغرام`)}</p>
            <p className="mt-1 font-serif text-4xl font-semibold tabular-nums text-gold-200 sm:text-6xl">{available ? formatRateAed(summary.current, locale) : t("Updating…", "جارٍ التحديث…")}</p>
            <p className="mt-2 text-sm text-white/70">
              {summary.changePercent != null && <span className={summary.direction === "up" ? "text-jade-200" : summary.direction === "down" ? "text-gold-200" : ""}>{formatSignedPct(summary.changePercent, locale)} {t("vs yesterday", "مقارنة بالأمس")} · </span>}
              {t("Updated", "آخر تحديث")} {updated} {t("(Dubai)", "(بتوقيت دبي)")}
            </p>
          </div>
          <GoldPriceBadge tone="dark" arabic={locale === "ar"} />
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={compareHref} className="inline-flex min-h-11 items-center rounded-full bg-gold-300 px-5 text-sm font-semibold text-jade-950 transition hover:bg-gold-200">
            {t(`Compare ${karat.karat}K making charges →`, `قارن مصنعية عيار ${karat.karat} ←`)}
          </Link>
          <a href="#rate-alert" className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10">
            {t("Get a price alert", "احصل على تنبيه بالسعر")}
          </a>
        </div>
      </Hero>

      <div className="container-pro py-10 sm:py-12">
        <section className="rounded-2xl border border-jade-900/10 bg-jade-50 p-5 sm:p-6">
          <h2 className="eyebrow text-jade-700">{t(`Daily summary · ${dateLabel}`, `الملخص اليومي · ${dateLabel}`)}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink">{available ? dailySummaryText(summary, karat, locale, dateLabel) : t("The rate is updating. Please check back in a moment.", "يتم تحديث السعر، يرجى المحاولة بعد قليل.")}</p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("Yesterday's close", "إغلاق الأمس")} value={summary.previousClose != null ? formatRateAed(summary.previousClose, locale) : "—"} detail={t("per gram", "للغرام")} />
          <Stat label={t("Change today", "التغير اليوم")} value={summary.change != null ? `${summary.change > 0 ? "+" : summary.change < 0 ? "−" : ""}${formatRateAed(Math.abs(summary.change), locale)}` : "—"} detail={formatSignedPct(summary.changePercent, locale)} tone={trend} />
          <Stat label={t("7-day change", "التغير خلال 7 أيام")} value={formatSignedPct(summary.weekChangePercent, locale)} tone={summary.weekChangePercent == null ? "default" : summary.weekChangePercent >= 0 ? "up" : "down"} />
          <Stat label={t("30-day range", "نطاق 30 يوماً")} value={summary.monthLow != null && summary.monthHigh != null ? `${formatRateAed(summary.monthLow, locale)} – ${formatRateAed(summary.monthHigh, locale)}` : "—"} detail={t("lowest – highest per gram", "الأدنى – الأعلى للغرام")} />
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="font-serif text-2xl text-jade-950">{t(`${karat.karat}K gold price by weight`, `سعر الذهب عيار ${karat.karat} حسب الوزن`)}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t("Gold value only, before making charges and VAT.", "قيمة الذهب فقط، قبل المصنعية والضريبة.")}</p>
            <table className="mt-4 w-full overflow-hidden rounded-2xl border border-jade-900/10 bg-white text-sm">
              <thead className="bg-jade-50 text-start text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="p-3 text-start">{t("Weight", "الوزن")}</th><th className="p-3 text-end">{t("Price", "السعر")}</th></tr>
              </thead>
              <tbody className="divide-y divide-jade-900/5">
                {RATE_WEIGHTS.map((weight) => (
                  <tr key={weight.id}><td className="p-3">{locale === "ar" ? weight.ar : weight.en}</td><td className="p-3 text-end font-semibold tabular-nums text-jade-950">{available ? formatRateAed(weightPrice(summary.current, weight.grams), locale) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="font-serif text-2xl text-jade-950">{t("Last 7 days", "آخر 7 أيام")}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t(`${karat.karat}K closing rate per gram.`, `سعر إغلاق غرام عيار ${karat.karat}.`)}</p>
            {recent.length ? (
              <table className="mt-4 w-full overflow-hidden rounded-2xl border border-jade-900/10 bg-white text-sm">
                <thead className="bg-jade-50 text-xs uppercase tracking-wide text-ink-muted">
                  <tr><th className="p-3 text-start">{t("Date", "التاريخ")}</th><th className="p-3 text-end">{t("Close", "الإغلاق")}</th></tr>
                </thead>
                <tbody className="divide-y divide-jade-900/5">
                  {recent.map((row) => (
                    <tr key={row.day}><td className="p-3">{new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${row.day}T00:00:00Z`))}</td><td className="p-3 text-end tabular-nums">{formatRateAed(karatRatePerGram(row.close, karat), locale)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="mt-4 rounded-2xl border border-dashed border-jade-900/15 p-5 text-sm text-ink-muted">{t("Daily history will appear here as days are recorded.", "سيظهر السجل اليومي هنا مع تسجيل الأيام.")}</p>}
            <Link href="/live-price" className="mt-3 inline-block text-sm font-semibold text-jade-700 hover:underline">{t("Full price history & insights →", "السجل الكامل وتحليلات السعر ←")}</Link>
          </section>
        </div>

        <section className="mt-10 grid gap-5 rounded-2xl border border-gold-300/50 bg-[#fbf7ee] p-6 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <div>
            <h2 className="font-serif text-2xl text-jade-950">{t("The rate is only part of the price", "سعر الذهب جزء من السعر فقط")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t(`Two ${karat.karat}K pieces of the same weight can differ by hundreds of dirhams because of the making charge. Get Gold shows every store's making charge and the live total, so you can compare before you visit or buy.`, `قد يختلف سعر قطعتين من عيار ${karat.karat} بنفس الوزن بمئات الدراهم بسبب المصنعية. يعرض Get Gold مصنعية كل محل والسعر الإجمالي المباشر لتقارن قبل الزيارة أو الشراء.`)}</p>
          </div>
          <Link href={compareHref} className="btn-primary justify-center text-center">{t(`Compare ${karat.karat}K making charges`, `قارن مصنعية عيار ${karat.karat}`)}</Link>
        </section>

        <OtherKarats locale={locale} price24k={snapshot.price24k} current={karat} />

        <section id="rate-alert" className="mt-12 scroll-mt-24">
          <RateAlertForm locale={locale} defaultKarat={karat.karat} currentRate={available ? summary.current : null} />
        </section>

        <FaqSection items={faq(karat, locale, summary.current)} locale={locale} />

        <p className="mt-10 text-xs leading-relaxed text-ink-muted">
          {t("Rates are indicative, derived from the international gold price and converted to AED at the standard purity for each karat. They are not an offer to buy or sell. Store prices include making charges and 5% VAT, and the store confirms the final price.", "الأسعار استرشادية ومحسوبة من سعر الذهب العالمي بالدرهم وفق النقاء القياسي لكل عيار، وليست عرضاً للبيع أو الشراء. تشمل أسعار المحلات المصنعية وضريبة القيمة المضافة 5٪، ويؤكد المحل السعر النهائي.")}
        </p>
      </div>
    </div>
  );
}

export function RateHubView({ locale, snapshot }: { locale: RateLocale; snapshot: RateSnapshot }) {
  const t = tr(locale);
  const dateLabel = dubaiDate(snapshot.fetchedAt, locale);
  const updated = snapshot.fetchedAt ? dubaiDate(snapshot.fetchedAt, locale, true) : "—";
  const k22 = RATE_KARATS[1];
  const summary22 = summarizeKaratRate(snapshot.history, snapshot.price24k, k22, snapshot.today);
  const available = snapshot.price24k > 0;
  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <Hero locale={locale} karat={null} title={t("Gold Rate Today in Dubai & UAE", "سعر الذهب اليوم في دبي والإمارات")}>
        <p className="mt-4 max-w-2xl text-white/70">{t(`Today's gold price per gram in AED for 24K, 22K, 21K and 18K, updated through the day. ${dateLabel}.`, `سعر غرام الذهب اليوم بالدرهم لعيارات 24 و22 و21 و18، مع تحديث مستمر خلال اليوم. ${dateLabel}.`)}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <GoldPriceBadge tone="dark" arabic={locale === "ar"} />
          <span className="text-xs text-white/60">{t("Updated", "آخر تحديث")} {updated} {t("(Dubai)", "(بتوقيت دبي)")}</span>
        </div>
      </Hero>
      <div className="container-pro py-10 sm:py-12">
        <section>
          <h2 className="font-serif text-2xl text-jade-950 sm:text-3xl">{t("Today's gold rate table (AED)", "جدول سعر الذهب اليوم (درهم)")}</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-jade-900/10 bg-white">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-jade-50 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="p-3 text-start">{t("Karat", "العيار")}</th>
                  <th className="p-3 text-end">{t("1 gram", "1 غرام")}</th>
                  <th className="p-3 text-end">{t("8 grams", "8 غرامات")}</th>
                  <th className="p-3 text-end">{t("1 tola", "1 تولة")}</th>
                  <th className="p-3 text-end">{t("vs yesterday", "مقارنة بالأمس")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-jade-900/5">
                {RATE_KARATS.map((item) => {
                  const s = summarizeKaratRate(snapshot.history, snapshot.price24k, item, snapshot.today);
                  return (
                    <tr key={item.slug}>
                      <td className="p-3"><Link className="font-semibold text-jade-800 hover:underline" href={ratePath(locale, item.slug)}>{t(`${item.karat}K`, `عيار ${item.karat}`)}</Link></td>
                      <td className="p-3 text-end font-semibold tabular-nums text-jade-950">{available ? formatRateAed(s.current, locale) : "—"}</td>
                      <td className="p-3 text-end tabular-nums">{available ? formatRateAed(weightPrice(s.current, 8), locale) : "—"}</td>
                      <td className="p-3 text-end tabular-nums">{available ? formatRateAed(weightPrice(s.current, 11.6638), locale) : "—"}</td>
                      <td className={`p-3 text-end tabular-nums ${s.direction === "up" ? "text-signal-ok" : s.direction === "down" ? "text-gold-600" : ""}`}>{formatSignedPct(s.changePercent, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="mt-6 rounded-2xl border border-jade-900/10 bg-jade-50 p-5 sm:p-6">
          <h2 className="eyebrow text-jade-700">{t(`Daily summary · ${dateLabel}`, `الملخص اليومي · ${dateLabel}`)}</h2>
          <p className="mt-3 leading-relaxed">{available ? dailySummaryText(summary22, k22, locale, dateLabel) : t("The rate is updating. Please check back in a moment.", "يتم تحديث السعر، يرجى المحاولة بعد قليل.")}</p>
          <Link href="/marketplace?sort=value" className="btn-primary mt-4 inline-flex">{t("Compare making charges across stores", "قارن المصنعية بين المحلات")}</Link>
        </section>
        <OtherKarats locale={locale} price24k={snapshot.price24k} current={null} />
        <section id="rate-alert" className="mt-12 scroll-mt-24">
          <RateAlertForm locale={locale} defaultKarat={22} currentRate={available ? summary22.current : null} />
        </section>
        <FaqSection items={faq(null, locale, summary22.current)} locale={locale} />
      </div>
    </div>
  );
}

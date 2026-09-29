import Link from "next/link";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ProductImage } from "@/components/ProductImage";
import { SignOutButton } from "@/components/SignOutButton";
import { requireUser, getCurrentProfile } from "@/lib/auth/server";
import { getLatestTick } from "@/lib/gold-price/service";
import {
  calculateReservationValue,
  formatDubaiDate,
  formatSignedPercent,
  isActiveLockStatus,
  isPurchaseStatus,
  isReservationActive,
  reservationStatusLabel,
  type PriceSnapshotForInsight,
  type ReservationValueInsight,
} from "@/lib/gold-insights";
import { formatAed, round2 } from "@/lib/pricing/calc";
import { getCustomerFeeOffer } from "@/lib/pricing/customer-fee";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ActiveOfferNotice } from "@/components/ActiveOfferNotice";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

interface ProductRow {
  name: string;
  category: string;
  karat: number;
  weight_grams: number | string;
  images: unknown;
}

interface SnapshotRow extends PriceSnapshotForInsight {
  total_price_aed: number | string;
  gold_price_fetched_at: string;
}

interface ReservationRow {
  id: string;
  status: string;
  quantity: number;
  expires_at: string;
  created_at: string;
  product: ProductRow | ProductRow[] | null;
  snapshot: SnapshotRow | SnapshotRow[] | null;
}

interface AccountEntry {
  reservation: ReservationRow;
  product: ProductRow | null;
  snapshot: SnapshotRow | null;
  insight: ReservationValueInsight | null;
}

export default async function AccountPage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const [profile, latestTick, feeOffer] = await Promise.all([
    getCurrentProfile(),
    getLatestTick(),
    getCustomerFeeOffer(user.id),
  ]);
  const admin = getServiceSupabase();
  const { data: rawReservations } = await admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, product:products(name, category, karat, weight_grams, images), snapshot:order_price_snapshots(gold_price_per_gram_24k_aed, karat_purity_factor, weight_grams, making_charge, certificate_fee, stone_value, vendor_premium, vendor_rate_adjustment_per_gram, vendor_rate_adjustment_aed, assay_fineness, platform_fee, delivery_fee, quantity, gold_value_aed, total_price_aed, gold_price_fetched_at)",
    )
    .eq("customer_user_id", user.id)
    .order("created_at", { ascending: false });

  const currentRate = Number(latestTick?.price_per_gram_24k_aed ?? 0);
  const entries: AccountEntry[] = ((rawReservations ?? []) as ReservationRow[]).map((reservation) => {
    const product = one(reservation.product);
    const snapshot = one(reservation.snapshot);
    return {
      reservation,
      product,
      snapshot,
      insight: snapshot && currentRate > 0 ? calculateReservationValue(snapshot, currentRate) : null,
    };
  });

  const purchases = entries.filter(({ reservation, insight }) => isPurchaseStatus(reservation.status) && insight);
  const activeLocks = entries.filter(({ reservation }) => isReservationActive(reservation.status, reservation.expires_at));
  const paidSpend = round2(purchases.reduce((sum, entry) => sum + Number(entry.snapshot?.total_price_aed ?? 0), 0));
  const currentComparable = round2(purchases.reduce((sum, entry) => sum + Number(entry.insight?.currentComparableTotalAed ?? 0), 0));
  const paidDifference = round2(currentComparable - paidSpend);
  const fineGoldGrams = purchases.reduce((sum, entry) => sum + Number(entry.insight?.fineGoldGrams ?? 0), 0);

  return (
    <div dir={arabic ? "rtl" : "ltr"}>
      <section className="bg-jade-950 text-white">
        <div className="container-pro py-10 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-gold-200">{t("Your Get Gold", "حسابك في Get Gold")}</p>
              <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">
                {t("Welcome back,", "أهلاً بعودتك،")} {profile?.full_name?.trim().split(/\s+/)[0] || t("gold buyer", "عزيزنا العميل")}.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
                {t("Your requests, completed purchases and market-linked value changes in one clear view.", "طلباتك ومشترياتك المكتملة وتغير قيمتها مقارنة بالسوق في مكان واحد.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <GoldPriceBadge compact tone="dark" arabic={arabic} />
              <Link href="/profile" className="btn-ghost border-white/20 bg-white/10 text-white hover:bg-white/15">{t("Edit profile", "تعديل الملف الشخصي")}</Link>
              <SignOutButton arabic={arabic} />
            </div>
          </div>
        </div>
      </section>

      <div className="container-pro py-10 sm:py-14">
        <div className="mb-6"><ActiveOfferNotice offer={feeOffer} arabic={arabic} /></div>
        <nav className="mb-8 flex flex-wrap gap-2" aria-label={t("Customer account", "حساب العميل")}>
          <Link href="/requests/new" className="btn-primary px-4 py-2 text-xs">{t("Request a piece", "اطلب قطعة")}</Link>
          <Link href="/account/requests" className="btn-ghost px-4 py-2 text-xs">{t("My gold requests", "طلباتي الخاصة")}</Link>
          <Link href="/account/visits" className="btn-ghost px-4 py-2 text-xs">{t("My store visits", "زيارات المتاجر")}</Link>
          <Link href="/account/saved" className="btn-ghost px-4 py-2 text-xs">{t("Saved & alerts", "المحفوظات والتنبيهات")}</Link>
          <Link href="/account/notifications" className="btn-ghost px-4 py-2 text-xs">{t("Notifications", "الإشعارات")}</Link>
          <Link href="/account/referrals" className="btn-ghost px-4 py-2 text-xs">{t("Invite friends", "ادعُ أصدقاءك")}</Link>
        </nav>
        {feeOffer.discountPercent > 0 && (
          <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-gold-500/25 bg-gold-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-gold-700">{t("50% off your Get Gold fee", "خصم 50% على رسوم Get Gold")}</p>
              <p className="mt-1 text-xs text-ink-muted">{arabic ? `رسومك التمهيدية 0.5% بدلاً من 1% للطلبات المؤهلة التالية وعددها ${feeOffer.remainingDiscountedOrders}، قبل أي عرض موسمي. التوصيل مستثنى.` : `Your introductory rate is 0.5% instead of the standard 1% on ${feeOffer.remainingDiscountedOrders} more qualifying ${feeOffer.remainingDiscountedOrders === 1 ? "order" : "orders"}, before any active seasonal fee offer. Delivery is excluded.`}</p>
            </div>
            <Link href="/marketplace" className="btn-primary shrink-0 px-4 py-2 text-xs">{t("Use this offer", "استخدم العرض")}</Link>
          </section>
        )}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AccountStat label={t("Completed purchases", "مشتريات مكتملة")} value={String(purchases.length)} detail={fineGoldGrams.toFixed(3) + t("g fine-gold equivalent", "غ ذهب خالص مكافئ")} />
          <AccountStat label={t("Total paid", "إجمالي المدفوع")} value={formatAed(paidSpend)} detail={t("Completed purchases only", "للمشتريات المكتملة فقط")} />
          <AccountStat label={t("Comparable value now", "القيمة المقارنة الآن")} value={formatAed(currentComparable)} detail={t("Same captured product components", "بالمكونات المسجلة نفسها")} />
          <AccountStat
            label={paidDifference >= 0 ? t("Locked-in advantage", "فرق السعر لصالحك") : t("Market-linked movement", "تغير القيمة مقارنة بالسوق")}
            value={(paidDifference > 0 ? "+" : "") + formatAed(paidDifference)}
            detail={paidDifference >= 0 ? t("Compared with buying the same items today", "مقارنة بشراء القطع نفسها اليوم") : t("Today’s comparable estimate is lower", "التقدير المقارن اليوم أقل")}
            tone={paidDifference > 0 ? "positive" : paidDifference < 0 ? "warm" : "default"}
          />
        </section>

        {purchases.length === 0 && (
          <section className="mt-6 rounded-2xl border border-jade-900/10 bg-jade-50 px-5 py-5">
            <h2 className="font-serif text-xl font-semibold text-jade-950">{t("Your purchase insights will appear here", "ستظهر تحليلات مشترياتك هنا")}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t("After a purchase is completed, Get Gold compares its recorded gold rate with the live market while retaining the original price snapshot.", "بعد اكتمال الشراء، يقارن Get Gold سعر الذهب المسجل بسعر السوق الحالي مع الاحتفاظ بسجل السعر الأصلي.")}</p>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-jade-600">{t("Purchase & request history", "سجل المشتريات والطلبات")}</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-jade-950">{t("Every order, in one place.", "كل طلباتك في مكان واحد.")}</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span>{arabic ? `${activeLocks.length} حجوزات مؤقتة نشطة` : `${activeLocks.length} active ${activeLocks.length === 1 ? "lock" : "locks"}`}</span>
              <Link href="/marketplace" className="font-semibold text-jade-700 hover:text-jade-500">{t("Browse gold →", "تصفح الذهب ←")}</Link>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {entries.map((entry) => <HistoryCard key={entry.reservation.id} entry={entry} currentRate={currentRate} arabic={arabic} />)}
            {entries.length === 0 && (
              <div className="card grid min-h-48 place-items-center p-8 text-center">
                <div>
                  <p className="font-serif text-2xl font-semibold text-jade-950">{t("No purchase requests yet", "لا توجد طلبات شراء بعد")}</p>
                  <p className="mt-2 text-sm text-ink-muted">{t("Your requests and confirmed purchases will appear here.", "ستظهر طلباتك ومشترياتك المؤكدة هنا.")}</p>
                  <Link href="/marketplace" className="btn-primary mt-5">{t("Explore the marketplace", "استكشف السوق")}</Link>
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-ink-muted">
          {t("Market-linked estimates hold non-gold charges at their captured amount and update only the gold component. They are not appraisals, resale offers, guaranteed returns or financial advice.", "تُبقي التقديرات المرتبطة بالسوق الرسوم غير الذهبية كما سُجلت، وتحدّث قيمة الذهب فقط. وهي ليست تقييماً أو عرض إعادة بيع أو عائداً مضموناً أو نصيحة مالية.")}
        </p>
      </div>
    </div>
  );
}

function HistoryCard({ entry, currentRate, arabic }: { entry: AccountEntry; currentRate: number; arabic: boolean }) {
  const t = (en: string, ar: string) => arabic ? ar : en;
  const { reservation, product, snapshot, insight } = entry;
  const active = isReservationActive(reservation.status, reservation.expires_at);
  const purchased = isPurchaseStatus(reservation.status);
  const closed = !active && !purchased;
  const lapsedLock = isActiveLockStatus(reservation.status) && !active;
  const difference = insight?.differenceAed ?? 0;

  return (
    <article className={["card overflow-hidden", closed ? "opacity-75" : ""].join(" ")}>
      <div className="grid sm:grid-cols-[9rem_1fr]">
        <div className="relative aspect-[4/3] bg-jade-50 sm:aspect-auto sm:min-h-44">
          <ProductImage
            category={product?.category}
            karat={product?.karat}
            name={product?.name ?? t("Gold product", "منتج ذهب")}
            images={product?.images}
            sizes="(max-width: 640px) 100vw, 144px"
          />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={reservation.status} lapsed={lapsedLock} arabic={arabic} />
                <span className="text-xs text-ink-muted">{formatDubaiDate(reservation.created_at, true)}</span>
              </div>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-jade-950">{product?.name ?? t("Gold item", "قطعة ذهب")}</h3>
              <p className="mt-1 text-sm text-ink-muted">
                {arabic ? `عيار ${product?.karat} · ${product?.weight_grams} غ للقطعة · الكمية ${reservation.quantity}` : `${product?.karat}K · ${product?.weight_grams}g each · quantity ${reservation.quantity}`}
              </p>
            </div>
            <div className="lg:text-end">
              <p className="label">{t("Recorded total", "الإجمالي المسجل")}</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-jade-950">{formatAed(Number(snapshot?.total_price_aed))}</p>
            </div>
          </div>

          {insight && !closed ? (
            <div className="mt-5 grid gap-3 border-t border-jade-900/10 pt-5 sm:grid-cols-3">
              <HistoryMetric label={t("Comparable value now", "القيمة المقارنة الآن")} value={formatAed(insight.currentComparableTotalAed)} />
              <HistoryMetric
                label={difference >= 0 ? t("Advantage vs today", "فرق السعر لصالحك") : t("Change vs today", "التغير مقارنة باليوم")}
                value={(difference > 0 ? "+" : "") + formatAed(difference)}
                tone={difference > 0 ? "positive" : difference < 0 ? "warm" : "default"}
              />
              <HistoryMetric label={t("24K rate movement", "تغير سعر عيار 24")} value={formatSignedPercent(insight.goldRateChangePercent)} />
            </div>
          ) : (
            <p className="mt-5 border-t border-jade-900/10 pt-4 text-xs text-ink-muted">
              {closed ? t("Closed requests stay in your history but are excluded from value insights.", "تبقى الطلبات المغلقة في سجلك، لكنها لا تدخل في تحليلات القيمة.") : t("Live comparison is temporarily unavailable.", "المقارنة المباشرة غير متاحة مؤقتاً.")}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {active ? t("Price lock expires ", "ينتهي تثبيت السعر ") + formatDubaiDate(reservation.expires_at, true) : purchased ? t("Captured at ", "سُجل بسعر ") + formatAed(Number(snapshot?.gold_price_per_gram_24k_aed)) + t("/g 24K", "/غ عيار 24") : lapsedLock ? t("Price lock ended ", "انتهى تثبيت السعر ") + formatDubaiDate(reservation.expires_at, true) : t("Request ", "الطلب: ") + (arabic ? arabicReservationStatus(reservation.status) : reservationStatusLabel(reservation.status).toLowerCase())}
              {currentRate > 0 && !closed ? t(" · live reference ", " · السعر المرجعي الحالي ") + formatAed(currentRate) + t("/g", "/غ") : ""}
            </p>
            <Link href={"/account/reservations/" + reservation.id + (purchased ? "#review" : "")} className="text-sm font-semibold text-jade-700 hover:text-jade-500">
              {purchased ? t("Review purchase →", "راجع مشترياتك ←") : t("View details →", "عرض التفاصيل ←")}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function AccountStat({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "positive" | "warm" }) {
  const color = tone === "positive" ? "text-signal-ok" : tone === "warm" ? "text-gold-600" : "text-jade-950";
  return (
    <div className="card p-5">
      <p className="label">{label}</p>
      <p className={["mt-3 font-serif text-2xl font-semibold tabular-nums", color].join(" ")}>{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function HistoryMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" | "warm" }) {
  const color = tone === "positive" ? "text-signal-ok" : tone === "warm" ? "text-gold-600" : "text-jade-950";
  return (
    <div className="rounded-xl bg-jade-50/70 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</p>
      <p className={["mt-1 text-sm font-semibold tabular-nums", color].join(" ")}>{value}</p>
    </div>
  );
}

function StatusPill({ status, lapsed = false, arabic = false }: { status: string; lapsed?: boolean; arabic?: boolean }) {
  const style = isPurchaseStatus(status)
    ? "border-signal-ok/25 bg-signal-ok/10 text-signal-ok"
    : isActiveLockStatus(status) && !lapsed
      ? "border-gold-400/25 bg-gold-50 text-gold-600"
      : "border-jade-900/10 bg-bone-soft text-ink-muted";
  return <span className={["pill", style].join(" ")}>{lapsed ? arabic ? "انتهى تثبيت السعر" : "Price lock expired" : arabic ? arabicReservationStatus(status) : reservationStatusLabel(status)}</span>;
}

function arabicReservationStatus(status: string): string {
  const labels: Record<string, string> = {
    pending_vendor_confirmation: "بانتظار تأكيد المتجر",
    pending_customer_acceptance: "بانتظار موافقتك على السعر",
    awaiting_payment: "بانتظار الدفع",
    payment_verification: "مراجعة الدفع",
    payment_confirmed: "تم تأكيد الدفع",
    preparing_order: "جارٍ تجهيز الطلب",
    ready_for_delivery: "جاهز للتوصيل",
    out_for_delivery: "خرج للتوصيل",
    delivered: "تم التوصيل",
    completed: "مكتمل",
    purchased: "تم الشراء",
    expired: "منتهي",
    cancelled: "ملغى",
    rejected: "مرفوض",
  };
  return labels[status] ?? reservationStatusLabel(status);
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

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
import { getServiceSupabase } from "@/lib/supabase/server";

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
  const [profile, latestTick] = await Promise.all([getCurrentProfile(), getLatestTick()]);
  const admin = getServiceSupabase();
  const { data: rawReservations } = await admin
    .from("reservations")
    .select(
      "id, status, quantity, expires_at, created_at, product:products(name, category, karat, weight_grams, images), snapshot:order_price_snapshots(gold_price_per_gram_24k_aed, karat_purity_factor, weight_grams, making_charge, certificate_fee, stone_value, vendor_premium, platform_fee, delivery_fee, quantity, gold_value_aed, total_price_aed, gold_price_fetched_at)",
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
    <>
      <section className="bg-jade-950 text-white">
        <div className="container-pro py-10 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-gold-200">Your GoldHub</p>
              <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">
                Welcome back, {profile?.full_name?.trim().split(/\s+/)[0] || "gold buyer"}.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
                Your locks, completed purchases and market-linked value changes in one clear view.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <GoldPriceBadge compact tone="dark" />
              <SignOutButton />
            </div>
          </div>
        </div>
      </section>

      <div className="container-pro py-10 sm:py-14">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AccountStat label="Completed purchases" value={String(purchases.length)} detail={fineGoldGrams.toFixed(3) + "g fine-gold equivalent"} />
          <AccountStat label="Total paid" value={formatAed(paidSpend)} detail="Completed purchases only" />
          <AccountStat label="Comparable value now" value={formatAed(currentComparable)} detail="Same captured product components" />
          <AccountStat
            label={paidDifference >= 0 ? "Locked-in advantage" : "Market-linked movement"}
            value={(paidDifference > 0 ? "+" : "") + formatAed(paidDifference)}
            detail={paidDifference >= 0 ? "Compared with buying the same items today" : "Today’s comparable estimate is lower"}
            tone={paidDifference > 0 ? "positive" : paidDifference < 0 ? "warm" : "default"}
          />
        </section>

        {purchases.length === 0 && (
          <section className="mt-6 rounded-2xl border border-jade-900/10 bg-jade-50 px-5 py-5">
            <h2 className="font-serif text-xl font-semibold text-jade-950">Your purchase insights will appear here</h2>
            <p className="mt-1 text-sm text-ink-muted">Once an order reaches Purchased, GoldHub will track its captured gold rate against the live market while keeping the original server snapshot intact.</p>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-jade-600">Purchase & reservation history</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-jade-950">Every price lock, remembered.</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span>{activeLocks.length} active {activeLocks.length === 1 ? "lock" : "locks"}</span>
              <Link href="/marketplace" className="font-semibold text-jade-700 hover:text-jade-500">Browse gold →</Link>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {entries.map((entry) => <HistoryCard key={entry.reservation.id} entry={entry} currentRate={currentRate} />)}
            {entries.length === 0 && (
              <div className="card grid min-h-48 place-items-center p-8 text-center">
                <div>
                  <p className="font-serif text-2xl font-semibold text-jade-950">No reservations yet</p>
                  <p className="mt-2 text-sm text-ink-muted">When you lock a listing, its complete price snapshot and market context will appear here.</p>
                  <Link href="/marketplace" className="btn-primary mt-5">Explore the marketplace</Link>
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-ink-muted">
          Market-linked estimates hold making, certificate or assay, stone, vendor premium and fees at the captured amount, then update only the gold component. They are not appraisals, resale offers, guaranteed returns or financial advice.
        </p>
      </div>
    </>
  );
}

function HistoryCard({ entry, currentRate }: { entry: AccountEntry; currentRate: number }) {
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
            name={product?.name ?? "Gold product"}
            images={product?.images}
            sizes="(max-width: 640px) 100vw, 144px"
          />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={reservation.status} lapsed={lapsedLock} />
                <span className="text-xs text-ink-muted">{formatDubaiDate(reservation.created_at, true)}</span>
              </div>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-jade-950">{product?.name ?? "Gold item"}</h3>
              <p className="mt-1 text-sm text-ink-muted">
                {product?.karat}K · {product?.weight_grams}g each · quantity {reservation.quantity}
              </p>
            </div>
            <div className="lg:text-right">
              <p className="label">Locked total</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-jade-950">{formatAed(Number(snapshot?.total_price_aed))}</p>
            </div>
          </div>

          {insight && !closed ? (
            <div className="mt-5 grid gap-3 border-t border-jade-900/10 pt-5 sm:grid-cols-3">
              <HistoryMetric label="Comparable value now" value={formatAed(insight.currentComparableTotalAed)} />
              <HistoryMetric
                label={difference >= 0 ? "Advantage vs today" : "Change vs today"}
                value={(difference > 0 ? "+" : "") + formatAed(difference)}
                tone={difference > 0 ? "positive" : difference < 0 ? "warm" : "default"}
              />
              <HistoryMetric label="24K rate movement" value={formatSignedPercent(insight.goldRateChangePercent)} />
            </div>
          ) : (
            <p className="mt-5 border-t border-jade-900/10 pt-4 text-xs text-ink-muted">
              {closed ? "Closed reservations stay in your history but are excluded from holdings and value insights." : "Live comparison is temporarily unavailable."}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {active ? "Price lock expires " + formatDubaiDate(reservation.expires_at, true) : purchased ? "Captured at " + formatAed(Number(snapshot?.gold_price_per_gram_24k_aed)) + "/g 24K" : lapsedLock ? "Price lock ended " + formatDubaiDate(reservation.expires_at, true) : "Reservation " + reservationStatusLabel(reservation.status).toLowerCase()}
              {currentRate > 0 && !closed ? " · live reference " + formatAed(currentRate) + "/g" : ""}
            </p>
            <Link href={"/account/reservations/" + reservation.id + (purchased ? "#review" : "")} className="text-sm font-semibold text-jade-700 hover:text-jade-500">
              {purchased ? "Review purchase →" : "View details →"}
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

function StatusPill({ status, lapsed = false }: { status: string; lapsed?: boolean }) {
  const style = isPurchaseStatus(status)
    ? "border-signal-ok/25 bg-signal-ok/10 text-signal-ok"
    : isActiveLockStatus(status) && !lapsed
      ? "border-gold-400/25 bg-gold-50 text-gold-600"
      : "border-jade-900/10 bg-bone-soft text-ink-muted";
  return <span className={["pill", style].join(" ")}>{lapsed ? "Price lock expired" : reservationStatusLabel(status)}</span>;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

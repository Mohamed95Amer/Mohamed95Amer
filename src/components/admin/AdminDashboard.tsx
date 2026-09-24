"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  commissionTrend,
  dubaiDay,
  paidOrder,
  summarizeCommissions,
  type CommissionOrder,
  type CommissionVendor,
  type LedgerEntry,
} from "@/lib/admin/commissions";
import { CommissionCards, money } from "./CommissionCards";
import { vendorOrderStatus } from "@/lib/vendor-workspace";
export function AdminDashboard({
  orders,
  vendors,
  ledger,
  arabic,
  adminId,
  actions,
}: {
  orders: CommissionOrder[];
  vendors: CommissionVendor[];
  ledger: LedgerEntry[];
  arabic: boolean;
  adminId: string;
  actions: { label: string; count: number; href: string }[];
}) {
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const [days, setDays] = useState(30),
    [demo, setDemo] = useState(false),
    [store, setStore] = useState(""),
    [charts, setCharts] = useState(true),
    [ready, setReady] = useState(false);
  const storageKey = "gg-admin-overview-v1:" + adminId;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if ([7, 30, 90].includes(saved.days)) setDays(saved.days);
      if (typeof saved.charts === "boolean") setCharts(saved.charts);
    } catch {
      /* Private browsing may disable storage. */
    }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(storageKey, JSON.stringify({ days, charts }));
      } catch {
        /* Display preferences are optional. */
      }
  }, [days, charts, ready, storageKey]);
  const stores = vendors.filter((v) => demo || !v.is_demo);
  const ids = new Set(stores.map((v) => v.id));
  const selected = orders.filter(
    (o) =>
      ids.has(o.vendor_id) &&
      (demo || !o.is_demo) &&
      (!store || o.vendor_id === store),
  );
  const entries = ledger.filter(
    (e) => ids.has(e.vendor_id) && (!store || e.vendor_id === store),
  );
  const allTime = summarizeCommissions(selected, entries);
  const trend = commissionTrend(selected, days),
    startDay = trend[0].day;
  const endDay = trend[trend.length - 1].day;
  const periodOrders = selected.filter(
    (o) =>
      dubaiDay(o.created_at) >= startDay && dubaiDay(o.created_at) <= endDay,
  );
  const periodPaid = selected.filter(
    (o) =>
      paidOrder(o) &&
      dubaiDay(o.earned_at) >= startDay &&
      dubaiDay(o.earned_at) <= endDay,
  );
  const period = summarizeCommissions(periodPaid, []);
  const groups = [
    {
      label: t("Vendor confirmation", "تأكيد المتجر"),
      statuses: ["pending_vendor_confirmation"],
      href: "pending_vendor_confirmation",
    },
    {
      label: t("Customer decision / payment", "قرار العميل / الدفع"),
      statuses: ["vendor_confirmed", "payment_pending"],
      href: "payment_pending",
    },
    {
      label: t("Payment verification", "التحقق من الدفع"),
      statuses: ["payment_verification"],
      href: "payment_verification",
    },
    {
      label: t("Fulfilment", "تجهيز وتوصيل"),
      statuses: [
        "payment_confirmed",
        "preparing_order",
        "ready_for_delivery",
        "out_for_delivery",
        "delivered",
      ],
      href: "preparing_order",
    },
  ].map((g) => ({
    ...g,
    count: selected.filter((o) => g.statuses.includes(vendorOrderStatus(o)))
      .length,
  }));
  const maxFee = Math.max(100, ...trend.map((b) => b.fee)),
    maxCount = Math.max(1, ...trend.map((b) => b.orders));
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-jade-950 p-6 text-white sm:p-8">
        <div className="flex flex-wrap justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-gold-200">
              {t("Your marketplace, at a glance", "سوقك في نظرة واحدة")}
            </p>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl">
              {t(
                "A clear view. Confident decisions.",
                "رؤية واضحة. وقرارات واثقة.",
              )}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
              {t(
                "Start with what needs attention, then track orders and your earnings. Real data only by default.",
                "ابدأ بما يحتاج اهتمامك، ثم تابع الطلبات وإيراداتك. تظهر البيانات الحقيقية فقط افتراضياً.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/notifications"
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-jade-950"
            >
              {t("Create a promotion", "إنشاء عرض")}
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-xl border border-white/30 px-4 py-3 text-sm"
            >
              {t("Store accounts", "حسابات المتاجر")}
            </Link>
          </div>
        </div>
      </section>
      <section
        aria-label={t("Needs attention", "بحاجة للاهتمام")}
        className="grid gap-3 sm:grid-cols-3"
      >
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card flex items-center justify-between gap-3 p-4 hover:border-gold-400"
          >
            <span className="text-sm text-ink-muted">{a.label}</span>
            <span className="rounded-xl bg-jade-50 px-3 py-2 text-lg font-semibold text-jade-900">
              {a.count}
            </span>
          </Link>
        ))}
      </section>
      <section className="card flex flex-wrap items-end gap-4 p-4">
        <label className="text-sm">
          {t("Period", "الفترة")}
          <select
            aria-label={t("Period", "الفترة")}
            className="input mt-1 block"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {t("Last", "آخر")} {d} {t("days", "يوماً")}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full min-w-0 text-sm sm:w-auto sm:min-w-[200px] sm:flex-1">
          {t("Store", "المتجر")}
          <select
            aria-label={t("Store", "المتجر")}
            className="input mt-1 w-full"
            value={store}
            onChange={(e) => setStore(e.target.value)}
          >
            <option value="">{t("All stores", "جميع المتاجر")}</option>
            {stores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.business_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => {
              setDemo(e.target.checked);
              setStore("");
            }}
          />
          {t("Include demo", "تضمين التجريبي")}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={charts}
            onChange={(e) => setCharts(e.target.checked)}
          />
          {t("Show charts", "إظهار الرسوم البيانية")}
        </label>
      </section>
      <div>
        <div className="mb-3 flex flex-wrap justify-between gap-2">
          <h3 className="font-serif text-xl">
            {t("Performance", "الأداء")} · {days} {t("days", "يوماً")}
          </h3>
          <p className="text-xs text-ink-muted">
            {t(
              "Calendar days · Dubai time · paid-date revenue",
              "أيام تقويمية · توقيت دبي · الإيراد حسب تاريخ الدفع",
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              t("Paid sales to stores", "مبيعات مدفوعة للمتاجر"),
              money(period.sales),
              t("Not Get Gold revenue", "ليست إيرادات Get Gold"),
            ],
            [
              t("Get Gold fees earned", "رسوم Get Gold المكتسبة"),
              money(period.earned),
              t("Before reconciliation adjustments", "قبل تعديلات التسوية"),
            ],
            [
              t("New order requests", "طلبات شراء جديدة"),
              String(periodOrders.length),
              t("Paid orders in period: ", "طلبات مدفوعة خلال الفترة: ") +
                period.paidCount,
            ],
          ].map(([label, value, hint]) => (
            <div key={label} className="card p-5">
              <p className="text-xs text-ink-muted">{label}</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {value}
              </p>
              <p className="mt-2 text-xs text-ink-muted">{hint}</p>
            </div>
          ))}
        </div>
      </div>
      {charts && (
        <section className="grid gap-5 xl:grid-cols-2">
          {[false, true].map((counts) => (
            <div className="card min-w-0 p-5" key={String(counts)}>
              <h3 className="font-serif text-xl">
                {counts
                  ? t("Paid order activity", "نشاط الطلبات المدفوعة")
                  : t("Fee earnings trend", "اتجاه الرسوم المكتسبة")}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                {counts
                  ? t(
                      "Orders confirmed paid each day",
                      "طلبات تأكد دفعها يومياً",
                    )
                  : t(
                      "AED · customer fee snapshots on paid orders",
                      "درهم · رسوم محفوظة للطلبات المدفوعة",
                    )}
              </p>
              <div
                className="mt-5 flex h-40 items-end gap-px border-b border-bone-deep"
                role="img"
                aria-label={
                  counts
                    ? t(
                        "Daily paid order counts. Exact values in table below.",
                        "عدد الطلبات المدفوعة يومياً. القيم في الجدول أدناه.",
                      )
                    : t(
                        "Daily earned fees. Exact values in table below.",
                        "الرسوم المكتسبة يومياً. القيم في الجدول أدناه.",
                      )
                }
              >
                {trend.map((bin) => {
                  const value = counts ? bin.orders : bin.fee;
                  return (
                    <div
                      key={bin.day}
                      title={bin.day + ": " + (counts ? value : money(value))}
                      className={`min-w-0 flex-1 rounded-t-sm ${counts ? "bg-gold-400" : "bg-jade-700"}`}
                      style={{
                        height: value
                          ? Math.max(
                              2,
                              (100 * value) / (counts ? maxCount : maxFee),
                            ) + "%"
                          : "1px",
                        opacity: value ? 1 : 0.15,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
                <span>{trend[0].day}</span>
                <span>{trend[trend.length - 1].day}</span>
              </div>
              <details className="mt-3">
                <summary className="min-h-8 cursor-pointer text-xs text-jade-700">
                  {t("View exact daily values", "عرض القيم اليومية")}
                </summary>
                <div className="mt-2 max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <caption className="sr-only">
                      {t("Daily performance", "الأداء اليومي")}
                    </caption>
                    <thead>
                      <tr>
                        <th className="p-2 text-start">
                          {t("Date (Dubai)", "التاريخ (دبي)")}
                        </th>
                        <th className="p-2 text-end">
                          {counts ? t("Paid orders", "طلبات مدفوعة") : "AED"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((b) => (
                        <tr key={b.day}>
                          <td className="p-2">{b.day}</td>
                          <td className="p-2 text-end">
                            {counts ? b.orders : money(b.fee)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ))}
        </section>
      )}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-xl">
            {t("Commission account · All time", "حساب الرسوم · جميع الفترات")}
          </h3>
          <Link
            className="text-sm text-jade-700 underline"
            href="/admin/commissions"
          >
            {t("Manage balances →", "إدارة الأرصدة ←")}
          </Link>
        </div>
        <CommissionCards value={allTime} arabic={arabic} />
        <p className="mt-2 text-xs text-ink-muted">
          {t(
            "Balances deliberately ignore the period filter; they include all account history for the selected store.",
            "الأرصدة لا تتأثر بفلتر الفترة؛ تشمل سجل الحساب بالكامل للمتجر المحدد.",
          )}
        </p>
      </section>
      <section className="card p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-serif text-xl">
            {t(
              "Order pipeline · Current status",
              "مسار الطلبات · الحالة الحالية",
            )}
          </h3>
          <Link
            href="/admin/orders"
            className="text-sm text-jade-700 underline"
          >
            {t("Open orders", "فتح الطلبات")}
          </Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => (
            <Link
              href={"/admin/orders?filter=" + g.href}
              key={g.href}
              className="rounded-xl bg-bone-soft p-4"
            >
              <p className="text-xs text-ink-muted">{g.label}</p>
              <p className="mt-2 text-2xl font-semibold">{g.count}</p>
              <div className="mt-3 h-1.5 rounded-full bg-bone-deep">
                <div
                  className="h-full rounded-full bg-jade-600"
                  style={{
                    width:
                      (g.count
                        ? Math.max(
                            4,
                            (g.count / Math.max(1, selected.length)) * 100,
                          )
                        : 0) + "%",
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          {t(
            "Current open work across all dates. Open order links show the full marketplace.",
            "العمل المفتوح حالياً عبر جميع الفترات. روابط الطلبات تعرض السوق بالكامل.",
          )}
        </p>
      </section>
    </div>
  );
}

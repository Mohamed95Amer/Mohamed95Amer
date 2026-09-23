"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  summarizeCommissions,
  type CommissionOrder,
  type CommissionVendor,
  type LedgerEntry,
} from "@/lib/admin/commissions";
import { CommissionCards, money } from "@/components/admin/CommissionCards";
import { formatDubaiDateTime } from "@/lib/presentation";
import { CommissionOrders } from "@/components/admin/CommissionOrders";
export function CommissionManager({
  orders,
  vendors,
  ledger,
  arabic,
}: {
  orders: CommissionOrder[];
  vendors: CommissionVendor[];
  ledger: LedgerEntry[];
  arabic: boolean;
}) {
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const router = useRouter(),
    [vendorId, setVendorId] = useState(""),
    [demo, setDemo] = useState(false),
    [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState("receipt"),
    [voidId, setVoidId] = useState(""),
    [formKey, setFormKey] = useState(0);
  const visibleVendors = vendors.filter((v) => demo || !v.is_demo);
  const visibleIds = new Set(visibleVendors.map((v) => v.id));
  const visibleOrders = orders.filter(
    (o) =>
      (demo || !o.is_demo) &&
      visibleIds.has(o.vendor_id) &&
      (!vendorId || o.vendor_id === vendorId),
  );
  const visibleLedger = ledger.filter(
    (e) =>
      visibleIds.has(e.vendor_id) && (!vendorId || e.vendor_id === vendorId),
  );
  const total = summarizeCommissions(visibleOrders, visibleLedger);
  const rows = visibleVendors
    .filter(
      (v) =>
        (!vendorId || v.id === vendorId) &&
        v.business_name.toLowerCase().includes(search.toLowerCase()),
    )
    .map((v) => ({
      ...v,
      ...summarizeCommissions(
        orders.filter((o) => o.vendor_id === v.id && (demo || !o.is_demo)),
        ledger.filter((e) => e.vendor_id === v.id),
      ),
    }))
    .sort((a, b) => b.balance - a.balance);
  async function mutate(payload: object) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/commission-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEntryId(crypto.randomUUID());
      setFormKey((k) => k + 1);
      setVoidId("");
      router.refresh();
      setMessage(
        t(
          "Saved to the ledger and audit log. No money was transferred.",
          "تم الحفظ في السجل المالي وسجل التدقيق. لم يتم تحويل أي أموال.",
        ),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  function selectStore(id: string) {
    setVendorId(id);
    setVoidId("");
    setEntryId(crypto.randomUUID());
    setFormKey((k) => k + 1);
    setMessage("");
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    mutate({
      action: "create",
      id: entryId,
      vendorId,
      kind,
      amount: Number(f.get("amount")),
      note: String(f.get("note")),
      reference: String(f.get("reference") ?? ""),
    });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-jade-600">
            {t("Store accounts · All time", "حسابات المتاجر · جميع الفترات")}
          </p>
          <h2 className="mt-2 font-serif text-3xl">
            {t("Every fee. One clear balance.", "كل رسم. ورصيد واضح.")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            {t(
              "Customers pay stores directly. Track Get Gold’s share separately, record remittances and keep a reason for every adjustment.",
              "يدفع العملاء للمتاجر مباشرة. تابع حصة Get Gold بشكل مستقل، وسجل التحويلات مع سبب لكل تعديل.",
            )}
          </p>
        </div>
        <Link href="/admin/marketing" className="btn-ghost">
          {t("Fee & delivery offers", "عروض الرسوم والتوصيل")}
        </Link>
      </div>
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <label className="w-full min-w-0 text-sm sm:w-auto sm:min-w-[200px] sm:flex-1">
          {t("Store account", "حساب المتجر")}
          <select
            aria-label={t("Store account", "حساب المتجر")}
            className="input mt-1 w-full"
            value={vendorId}
            disabled={busy}
            onChange={(e) => selectStore(e.target.value)}
          >
            <option value="">{t("All stores", "جميع المتاجر")}</option>
            {visibleVendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.business_name}
                {v.is_demo ? " · DEMO" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={demo}
            disabled={busy}
            onChange={(e) => {
              setDemo(e.target.checked);
              selectStore("");
            }}
          />
          {t("Include demo data", "تضمين البيانات التجريبية")}
        </label>
      </div>
      <CommissionCards value={total} arabic={arabic} />
      <p className="text-xs leading-6 text-ink-muted">
        {t("Pending fees (not earned):", "رسوم معلقة (غير مكتسبة):")}{" "}
        {money(total.pending)} ·{" "}
        {t(
          "Legacy fee-model orders excluded:",
          "طلبات بنظام الرسوم السابق مستبعدة:",
        )}{" "}
        {total.legacy}
        {total.missing > 0 && (
          <>
            {" "}
            · {t("Missing price snapshots:", "لقطات أسعار مفقودة:")}{" "}
            {total.missing}
          </>
        )}
      </p>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h3 className="font-serif text-xl">
            {t("Commission by store", "الرسوم حسب المتجر")}
          </h3>
          <input
            type="search"
            aria-label={t("Search stores", "بحث المتاجر")}
            placeholder={t("Search stores…", "ابحث عن متجر…")}
            className="input max-w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-bone-soft text-xs text-ink-muted">
              <tr>
                {[
                  t("Store", "المتجر"),
                  t("Earned", "المكتسب"),
                  t("Received", "المستلم"),
                  t("Net credits", "صافي الأرصدة"),
                  t("Balance", "الرصيد"),
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap p-4 text-start font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-t border-bone-deep">
                  <td className="p-4">
                    <button
                      className="text-start font-semibold text-jade-800 underline underline-offset-4"
                      disabled={busy}
                      onClick={() => selectStore(v.id)}
                    >
                      {v.business_name}
                    </button>
                    {v.is_demo && <span className="ms-2 text-xs">DEMO</span>}
                  </td>
                  <td className="whitespace-nowrap p-4">{money(v.earned)}</td>
                  <td className="whitespace-nowrap p-4">{money(v.received)}</td>
                  <td className="whitespace-nowrap p-4">
                    {money(v.deliveryCredits + v.credits - v.debits)}
                  </td>
                  <td className="whitespace-nowrap p-4 font-semibold">
                    {money(v.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="p-6 text-sm text-ink-muted">
            {t("No stores match this view.", "لا توجد متاجر مطابقة.")}
          </p>
        )}
      </section>
      {vendorId ? (
        <div className="grid items-start gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <form key={formKey} onSubmit={submit} className="card space-y-4 p-5">
            <h3 className="font-serif text-xl">
              {t("Record a receipt or adjustment", "تسجيل استلام أو تعديل")}
            </h3>
            <p className="text-sm text-ink-muted">
              {visibleVendors.find((v) => v.id === vendorId)?.business_name}
            </p>
            <label className="block text-sm">
              {t("Entry type", "نوع القيد")}
              <select
                className="input mt-1 w-full"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="receipt">
                  {t("Payment received from store", "دفعة مستلمة من المتجر")}
                </option>
                <option value="credit">
                  {t(
                    "Credit / waive fees (reduces balance)",
                    "رصيد دائن / إعفاء (يخفض الرصيد)",
                  )}
                </option>
                <option value="debit">
                  {t(
                    "Debit adjustment (increases balance)",
                    "تعديل مدين (يزيد الرصيد)",
                  )}
                </option>
              </select>
            </label>
            <label className="block text-sm">
              {t("Amount (AED)", "المبلغ (درهم)")}
              <input
                className="input mt-1 w-full"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max="10000000"
                required
              />
            </label>
            <label className="block text-sm">
              {t("Bank / receipt reference", "مرجع البنك / الإيصال")}
              {kind !== "receipt" && " · " + t("optional", "اختياري")}
              <input
                name="reference"
                required={kind === "receipt"}
                maxLength={120}
                className="input mt-1 w-full"
              />
            </label>
            <label className="block text-sm">
              {t("Reason / reconciliation note", "السبب / ملاحظة التسوية")}
              <textarea
                className="input mt-1 w-full"
                name="note"
                minLength={5}
                maxLength={500}
                required
              />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input type="checkbox" required className="mt-1" />
              {kind === "receipt"
                ? t(
                    "I checked Get Gold’s account and received this payment. This is not a customer payment confirmation.",
                    "راجعت حساب Get Gold وتأكدت من استلام الدفعة. هذا ليس تأكيداً لدفعة العميل.",
                  )
                : t(
                    "I reviewed this correction. It changes only store reconciliation, not the customer’s order price.",
                    "راجعت هذا التعديل. يغير تسوية المتجر فقط ولا يغير سعر طلب العميل.",
                  )}
            </label>
            <button className="btn-primary" disabled={busy}>
              {busy
                ? t("Saving…", "جارٍ الحفظ…")
                : t("Record entry", "تسجيل القيد")}
            </button>
          </form>
          <section className="card p-5">
            <h3 className="font-serif text-xl">
              {t("Account history", "سجل الحساب")}
            </h3>
            <p className="mt-2 text-xs text-ink-muted">
              {t(
                "Original entries are kept. Void mistakes with a reason; nothing is silently overwritten.",
                "يتم الاحتفاظ بالقيود الأصلية. ألغِ الأخطاء مع ذكر السبب؛ لا تُحذف التعديلات بصمت.",
              )}
            </p>
            <div className="mt-4 divide-y divide-bone-deep">
              {[...visibleLedger]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((e) => (
                  <article key={e.id} className="py-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-semibold">
                        {arabic
                          ? {
                              receipt: "استلام",
                              credit: "دائن",
                              debit: "مدين",
                            }[e.kind]
                          : e.kind}{" "}
                        · {money(Math.round(e.amount_aed * 100))}
                      </p>
                      <span className="text-xs text-ink-muted">
                        {formatDubaiDateTime(e.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm">{e.note}</p>
                    {e.reference && (
                      <p className="mt-1 break-words text-xs text-ink-muted">
                        {e.reference}
                      </p>
                    )}
                    {e.voided_at ? (
                      <p className="mt-2 text-xs text-red-700">
                        {t("Voided:", "ملغى:")} {e.void_reason}
                      </p>
                    ) : (
                      <button
                        className="mt-2 min-h-10 text-xs text-red-700 underline"
                        onClick={() => setVoidId(e.id)}
                      >
                        {t("Void this entry", "إلغاء هذا القيد")}
                      </button>
                    )}
                  </article>
                ))}
            </div>
            {!visibleLedger.length && (
              <p className="py-6 text-sm text-ink-muted">
                {t(
                  "No recorded receipts or adjustments yet.",
                  "لا توجد دفعات أو تعديلات مسجلة بعد.",
                )}
              </p>
            )}
            {voidId && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  mutate({
                    action: "void",
                    id: voidId,
                    note: String(f.get("reason")),
                  });
                }}
                className="mt-4 space-y-3 rounded-xl border border-red-200 p-4"
              >
                <label className="block text-sm">
                  {t("Reason for voiding", "سبب الإلغاء")}
                  <input
                    name="reason"
                    className="input mt-1 w-full"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                </label>
                <button disabled={busy} className="btn-primary">
                  {t("Confirm void", "تأكيد الإلغاء")}
                </button>
                <button
                  type="button"
                  className="btn-ghost ms-2"
                  onClick={() => setVoidId("")}
                >
                  {t("Cancel", "رجوع")}
                </button>
              </form>
            )}
          </section>
        </div>
      ) : (
        <p className="card p-5 text-sm text-ink-muted">
          {t(
            "Select a store above to record a payment, credit or correction and inspect its account history.",
            "اختر متجراً لتسجيل دفعة أو رصيد أو تعديل وعرض سجل حسابه.",
          )}
        </p>
      )}
      {vendorId && (
        <CommissionOrders
          key={vendorId}
          orders={visibleOrders}
          arabic={arabic}
        />
      )}
      {message && (
        <p role="status" className="card p-4 text-sm">
          {message}
        </p>
      )}
      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          {t("How these numbers are calculated", "كيف تُحسب هذه الأرقام؟")}
        </summary>
        <p className="mt-3 text-sm leading-7 text-ink-muted">
          {t(
            "Earned fees use the saved customer-fee snapshot × item quantity, only after payment is confirmed. Refunded, cancelled and expired orders are excluded. Net balance = fees earned − Get Gold-funded delivery discounts + debit adjustments − credits − recorded receipts. Negative balances are credits due to stores, not zero. Older fee-model orders are excluded from fees; missing snapshots are flagged. Demo data is excluded by default. Historical customer prices are never recalculated.",
            "الرسوم المكتسبة من لقطة رسوم العميل المحفوظة × الكمية، بعد تأكيد الدفع فقط. تُستبعد الطلبات المستردة والملغاة والمنتهية. الرصيد الصافي = الرسوم − خصومات التوصيل الممولة من Get Gold + المدين − الدائن − الدفعات المسجلة. الرصيد السالب حق للمتجر وليس صفراً. تُستبعد أنظمة الرسوم القديمة وتُوضح لقطات الأسعار المفقودة. البيانات التجريبية مستبعدة افتراضياً. لا يُعاد احتساب أسعار العملاء السابقة.",
          )}
        </p>
      </details>
    </div>
  );
}

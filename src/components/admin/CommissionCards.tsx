import { summarizeCommissions } from "@/lib/admin/commissions";
export const money = (fils: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(fils / 100);
export function CommissionCards({
  value,
  arabic,
}: {
  value: ReturnType<typeof summarizeCommissions>;
  arabic: boolean;
}) {
  const cards = [
    [
      arabic ? "رسوم Get Gold المكتسبة" : "Get Gold fees earned",
      value.earned,
      arabic
        ? "طلبات مدفوعة · قبل التسويات"
        : "Paid orders · before adjustments",
    ],
    [
      arabic ? "مبالغ مستلمة مسجلة" : "Recorded receipts",
      value.received,
      arabic
        ? "سجلتها الإدارة · ليست تحققاً بنكياً"
        : "Entered by admin · not bank verification",
    ],
    [
      arabic ? "خصومات وتعديلات صافية" : "Net credits & adjustments",
      value.deliveryCredits + value.credits - value.debits,
      arabic
        ? "خصومات التوصيل + الأرصدة − المدين"
        : "Delivery credits + credits − debits",
    ],
    [
      arabic ? "الرصيد الصافي" : "Net balance",
      value.balance,
      value.balance < 0
        ? arabic
          ? "رصيد لصالح المتاجر"
          : "Credit owed back to stores"
        : arabic
          ? "مستحق من المتاجر"
          : "Due from stores",
    ],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, amount, hint], i) => (
        <div
          key={label}
          className={`rounded-2xl border p-5 ${i === 3 ? "border-jade-900 bg-jade-950 text-white" : "border-bone-deep bg-white"}`}
        >
          <p
            className={`text-xs font-medium ${i === 3 ? "text-white/80" : "text-ink-muted"}`}
          >
            {label}
          </p>
          <p
            className="mt-3 break-words text-2xl font-semibold tabular-nums"
            dir="ltr"
          >
            {money(amount)}
          </p>
          <p
            className={`mt-2 text-xs leading-5 ${i === 3 ? "text-white/75" : "text-ink-muted"}`}
          >
            {hint}
          </p>
        </div>
      ))}
    </div>
  );
}

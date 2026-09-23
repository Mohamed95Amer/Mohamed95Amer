"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  const arabic =
    typeof document !== "undefined" && document.documentElement.lang === "ar";
  return (
    <section className="card p-8" role="alert">
      <h2 className="font-serif text-2xl">
        {arabic
          ? "تعذر تحميل بيانات الإدارة"
          : "Administration data could not be loaded"}
      </h2>
      <p className="mt-3 text-sm text-ink-muted">
        {arabic
          ? "لم نعرض أرقاماً غير مكتملة. أعد المحاولة قبل اتخاذ أي قرار مالي."
          : "Incomplete totals have not been shown. Please retry before making a financial decision."}
      </p>
      <button className="btn-primary mt-5" onClick={reset}>
        {arabic ? "إعادة المحاولة" : "Try again"}
      </button>
    </section>
  );
}

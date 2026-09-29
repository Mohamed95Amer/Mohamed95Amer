import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ManualRefreshButton } from "./ManualRefreshButton";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminGoldPricePage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const { data: ticks } = await admin
    .from("gold_price_ticks")
    .select("*")
    .order("fetched_at", { ascending: false })
    .limit(100);
  const failed = (ticks ?? []).filter((t) => t.status !== "ok").length;

  return (
    <div className="grid gap-6" dir={arabic ? "rtl" : "ltr"}>
      <div className="card p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">{t("Gold price monitor", "مراقبة سعر الذهب")}</h2>
          <p className="text-sm text-ink-muted">{t("Last 100 ticks", "آخر 100 تحديث")} · {failed} {t("non-ok", "غير سليم")}</p>
          <div className="mt-3"><GoldPriceBadge arabic={arabic} /></div>
        </div>
        <ManualRefreshButton arabic={arabic} />
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-[880px] w-full text-sm">
          <thead className="bg-bone-soft text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-start">{t("When", "الوقت")}</th>
              <th className="px-4 py-2 text-start">{t("Source", "المصدر")}</th>
              <th className="px-4 py-2 text-end">XAU/USD</th>
              <th className="px-4 py-2 text-end">USD/AED</th>
              <th className="px-4 py-2 text-end">{t("AED/g 24K", "درهم/غ عيار 24")}</th>
              <th className="px-4 py-2 text-start">{t("Status", "الحالة")}</th>
              <th className="px-4 py-2 text-start">{t("Error", "الخطأ")}</th>
            </tr>
          </thead>
          <tbody>
            {(ticks ?? []).map((t) => (
              <tr key={t.id} className="border-t border-bone-deep">
                <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(t.fetched_at)}</td>
                <td className="px-4 py-2">{t.source}</td>
                <td className="px-4 py-2 text-right">{t.xau_usd ?? "—"}</td>
                <td className="px-4 py-2 text-right">{t.usd_aed}</td>
                <td className="px-4 py-2 text-right">{t.price_per_gram_24k_aed ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`pill ${
                    t.status === "ok" ? "border-signal-ok/30 bg-signal-ok/10 text-signal-ok" :
                    t.status === "degraded" ? "border-signal-warn/30 bg-signal-warn/10 text-signal-warn" :
                    "border-signal-err/30 bg-signal-err/10 text-signal-err"
                  }`}>{arabic ? ({ ok: "سليم", degraded: "متدهور", error: "خطأ" } as Record<string,string>)[t.status] ?? statusLabel(t.status) : statusLabel(t.status)}</span>
                </td>
                <td className="px-4 py-2 text-ink-muted max-w-xs truncate">{t.error_message ?? "—"}</td>
              </tr>
            ))}
            {(ticks ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">{t("No ticks.", "لا توجد تحديثات مسجلة.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

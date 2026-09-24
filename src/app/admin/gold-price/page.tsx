import { getServiceSupabase } from "@/lib/supabase/server";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ManualRefreshButton } from "./ManualRefreshButton";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function AdminGoldPricePage() {
  const admin = getServiceSupabase();
  const { data: ticks } = await admin
    .from("gold_price_ticks")
    .select("*")
    .order("fetched_at", { ascending: false })
    .limit(100);
  const failed = (ticks ?? []).filter((t) => t.status !== "ok").length;

  return (
    <div className="grid gap-6">
      <div className="card p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">Gold price monitor</h2>
          <p className="text-sm text-ink-muted">Last 100 ticks · {failed} non-ok</p>
          <div className="mt-3"><GoldPriceBadge /></div>
        </div>
        <ManualRefreshButton />
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-[880px] w-full text-sm">
          <thead className="bg-bone-soft text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-right">XAU/USD</th>
              <th className="px-4 py-2 text-right">USD/AED</th>
              <th className="px-4 py-2 text-right">AED/g 24K</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Error</th>
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
                  }`}>{statusLabel(t.status)}</span>
                </td>
                <td className="px-4 py-2 text-ink-muted max-w-xs truncate">{t.error_message ?? "—"}</td>
              </tr>
            ))}
            {(ticks ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">No ticks.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

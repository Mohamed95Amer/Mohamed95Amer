import { cookies } from "next/headers";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime } from "@/lib/presentation";

export const dynamic = "force-dynamic";

type Lead = { id: string; created_at: string; email: string; whatsapp: string | null; karat: number; frequency: string; target_rate_aed: number | null; locale: string; source_path: string | null; active: boolean; last_sent_at: string | null };

export default async function LeadsPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const admin = getServiceSupabase();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data, error }, total, active, week, whatsapp] = await Promise.all([
    admin.from("rate_alert_subscriptions").select("id, created_at, email, whatsapp, karat, frequency, target_rate_aed, locale, source_path, active, last_sent_at").order("created_at", { ascending: false }).limit(200),
    admin.from("rate_alert_subscriptions").select("id", { count: "exact", head: true }),
    admin.from("rate_alert_subscriptions").select("id", { count: "exact", head: true }).eq("active", true),
    admin.from("rate_alert_subscriptions").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("rate_alert_subscriptions").select("id", { count: "exact", head: true }).not("whatsapp", "is", null),
  ]);
  const leads = (data ?? []) as Lead[];
  const sendingOn = Boolean(process.env.RESEND_API_KEY && process.env.RATE_ALERT_FROM_EMAIL);
  return (
    <div dir={arabic ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-jade-600">{t("Gold rate pages", "صفحات سعر الذهب")}</p>
          <h2 className="mt-1 font-serif text-3xl text-jade-950">{t("Rate-alert leads", "عملاء تنبيهات السعر")}</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("Visitors who asked for gold rate alerts and agreed to hear from Get Gold. Respect unsubscribes: inactive rows must not be contacted.", "زوار طلبوا تنبيهات سعر الذهب ووافقوا على التواصل. احترم إلغاء الاشتراك: لا تتواصل مع الصفوف غير النشطة.")}</p>
        </div>
        <a href="/api/admin/rate-alert-leads/export" className="btn-primary">{t("Export CSV", "تصدير CSV")}</a>
      </div>
      <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${sendingOn ? "bg-jade-50 text-jade-900" : "bg-gold-50 text-ink"}`}>
        {sendingOn ? t("Alert emails are ON (sent daily at 09:00 Dubai).", "رسائل التنبيه مفعّلة (ترسل يومياً الساعة 09:00 بتوقيت دبي).") : t("Alert emails are OFF until RESEND_API_KEY and RATE_ALERT_FROM_EMAIL are set in Vercel. Sign-ups are still being collected.", "رسائل التنبيه متوقفة حتى إضافة RESEND_API_KEY وRATE_ALERT_FROM_EMAIL في Vercel. ما زال التسجيل مستمراً.")}
      </div>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={t("Total sign-ups", "إجمالي المسجلين")} value={total.count ?? 0} />
        <Metric label={t("Active", "نشط")} value={active.count ?? 0} />
        <Metric label={t("Last 7 days", "آخر 7 أيام")} value={week.count ?? 0} />
        <Metric label={t("With WhatsApp", "مع واتساب")} value={whatsapp.count ?? 0} />
      </section>
      {error ? <p className="mt-6 text-sm text-signal-err">{t("Could not load leads.", "تعذر تحميل البيانات.")}</p> : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-jade-900/10 bg-white">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-jade-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>{[t("Signed up", "التسجيل"), t("Email", "البريد"), "WhatsApp", t("Karat", "العيار"), t("Alert", "التنبيه"), t("Language", "اللغة"), t("Page", "الصفحة"), t("Status", "الحالة")].map((head) => <th key={head} className="p-3 text-start">{head}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-jade-900/5">
              {leads.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-muted">{t("No sign-ups yet.", "لا يوجد مسجلون بعد.")}</td></tr>}
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="p-3 whitespace-nowrap">{formatDubaiDateTime(lead.created_at)}</td>
                  <td className="p-3" dir="ltr">{lead.email}</td>
                  <td className="p-3" dir="ltr">{lead.whatsapp ?? "—"}</td>
                  <td className="p-3">{lead.karat}K</td>
                  <td className="p-3">{lead.frequency === "target" ? `${t("Target", "هدف")} ${lead.target_rate_aed ?? ""}` : t("Daily", "يومي")}{lead.frequency === "daily" && lead.target_rate_aed ? ` · ${lead.target_rate_aed}` : ""}</td>
                  <td className="p-3">{lead.locale.toUpperCase()}</td>
                  <td className="p-3 text-xs text-ink-muted" dir="ltr">{lead.source_path ?? "—"}</td>
                  <td className="p-3">{lead.active ? t("Active", "نشط") : t("Unsubscribed", "ألغى الاشتراك")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="card p-5"><p className="label">{label}</p><p className="mt-2 font-serif text-3xl text-jade-950">{value}</p></div>;
}

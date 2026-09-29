import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function GrowthPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase(); const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: events }, favourites, alerts, referrals, delivery] = await Promise.all([
    admin.from("marketplace_events").select("event_name, occurred_at, product_id, vendor_id").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(10000),
    admin.from("product_favourites").select("product_id", { count: "exact", head: true }),
    admin.from("price_alerts").select("id", { count: "exact", head: true }).eq("active", true),
    admin.from("referral_attributions").select("referred_user_id", { count: "exact", head: true }),
    admin.from("delivery_assignments").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const counts = new Map<string, number>(); for (const event of events ?? []) counts.set(event.event_name, (counts.get(event.event_name) ?? 0) + 1); const views = counts.get("marketplace_view") ?? 0; const productViews = counts.get("product_view") ?? 0; const identityStarts = counts.get("identity_started") ?? 0; const reservations = counts.get("reservation_created") ?? 0;
  return <div dir={arabic ? "rtl" : "ltr"}>
    <p className="eyebrow text-jade-600">{t("First-party measurement", "قياس المنصة")}</p><h2 className="mt-1 font-serif text-3xl text-jade-950">{t("Growth & conversion funnel", "النمو ومسار التحويل")}</h2><p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("Privacy-minimal events from the last 30 days. Counts are directional product analytics—not audited revenue—and metadata excludes addresses, identity documents and biometrics.", "أحداث محدودة البيانات خلال آخر 30 يوماً. الأرقام مؤشرات استخدام وليست إيرادات مدققة، ولا تتضمن العناوين أو مستندات الهوية أو البيانات الحيوية.")}</p>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label={t("Marketplace views", "زيارات السوق")} value={views} detail={t("Discovery entry", "بدء التصفح")} /><Metric label={t("Product views", "مشاهدات المنتجات")} value={productViews} detail={rate(productViews, views) + t(" of marketplace views", " من زيارات السوق")} /><Metric label={t("Identity checks started", "عمليات تحقق بدأت")} value={identityStarts} detail={rate(identityStarts, productViews) + t(" of product views", " من مشاهدات المنتجات")} /><Metric label={t("Orders created", "طلبات أُنشئت")} value={reservations} detail={rate(reservations, identityStarts) + t(" of identity starts", " من عمليات التحقق")}/></section>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label={t("Searches", "عمليات البحث")} value={counts.get("search") ?? 0} detail={t("Filter intent", "اهتمام التصفية")} /><Metric label={t("Saved items", "منتجات محفوظة")} value={favourites.count ?? 0} detail={t("Current total", "الإجمالي الحالي")} /><Metric label={t("Active price alerts", "تنبيهات الأسعار النشطة")} value={alerts.count ?? 0} detail={t("Current total", "الإجمالي الحالي")} /><Metric label={t("Referred signups", "تسجيلات عبر الدعوات")} value={referrals.count ?? 0} detail={t("Attributed accounts", "حسابات منسوبة للدعوات")} /></section>
    <section className="card mt-6 p-6"><h3 className="font-serif text-2xl text-jade-950">{t("Demand-path signals", "مؤشرات طلب العملاء")}</h3><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5"><MetricInner label={t("Buyer requests", "طلبات العملاء")} value={counts.get("buyer_request_created") ?? 0} /><MetricInner label={t("Offers accepted", "عروض مقبولة")} value={counts.get("offer_accepted") ?? 0} /><MetricInner label={t("Store visits", "زيارات المتاجر")} value={counts.get("store_visit_requested") ?? 0} /><MetricInner label={t("Courier assignments", "مهام التوصيل")} value={delivery.count ?? 0} /><MetricInner label={t("Referral shares", "مشاركات الدعوة")} value={counts.get("referral_shared") ?? 0} /></div>{events?.[0] && <p className="mt-4 text-xs text-ink-muted">{t("Latest captured event:", "آخر حدث مسجل:")} {formatDubaiDateTime(events[0].occurred_at)}</p>}</section>
  </div>;
}

function rate(value: number, base: number) { return base > 0 ? `${Math.round(value / base * 100)}%` : "—"; }
function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="card p-5"><p className="label">{label}</p><p className="mt-2 font-serif text-3xl text-jade-950">{value}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>; }
function MetricInner({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-jade-50 p-4"><p className="label">{label}</p><p className="mt-2 font-serif text-2xl text-jade-950">{value}</p></div>; }

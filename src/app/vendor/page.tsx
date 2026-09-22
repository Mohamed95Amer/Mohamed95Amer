import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { vendorOrderGroup, vendorStatus } from "@/lib/vendor-workspace";
export const dynamic = "force-dynamic";

export default async function VendorDashboardPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin.from("vendors").select("*").eq("owner_user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load your store.");
  if (!vendor) redirect("/vendor/register");
  const results = await Promise.all([
    admin.from("products").select("id, product_status, quantity, data_quality_status").eq("vendor_id", vendor.id),
    admin.from("reservations").select("status, expires_at, vendor_action_available_at, payment_method").eq("vendor_id", vendor.id).not("status", "in", "(completed,paid,cancelled,expired,refunded,rejected_by_vendor)"),
    admin.from("vendor_payment_settings").select("aani_enabled, bank_transfer_enabled, cash_enabled, card_enabled").eq("vendor_id", vendor.id).maybeSingle(),
    admin.from("vendor_working_hours").select("day_of_week").eq("vendor_id", vendor.id),
    admin.from("vendor_liquidity_summary").select("live_listings, reservations_30d, request_offers_30d, visit_requests_30d").eq("vendor_id", vendor.id).maybeSingle(),
  ]);
  if (results.some(r => r.error)) throw new Error("Could not load your store overview. Please try again.");
  const products = results[0].data ?? [];
  const orders = results[1].data ?? [];
  const payments = results[2].data;
  const hours = results[3].data ?? [];
  const activity = results[4].data;
  const now = Date.now();
  const count = (group: string) => orders.filter(o => vendorOrderGroup(o, now) === group).length;
  const drafts = products.filter(p => p.product_status === "draft").length;
  const attention = products.filter(p => ["rejected", "suspended"].includes(p.product_status) || p.data_quality_status === "blocked" || Number(p.quantity) === 0).length;
  const checklist = [
    { done: Boolean(vendor.business_name && vendor.trade_license_number && vendor.phone), title: t("Store details", "بيانات المتجر"), body: t("Your business and contact information.", "معلومات نشاطك التجاري ووسائل التواصل."), href: "/vendor/register" },
    { done: vendor.store_latitude != null && vendor.store_longitude != null, title: t("Store location", "موقع المتجر"), body: t("A precise pin helps customers find you.", "دبوس دقيق ليسهل على العملاء الوصول إليك."), href: "/vendor/register" },
    { done: Boolean(payments && (payments.aani_enabled || payments.bank_transfer_enabled || payments.cash_enabled || payments.card_enabled)), title: t("Payment options", "خيارات الدفع"), body: t("Choose how customers pay your store.", "اختر طرق دفع العملاء لمتجرك."), href: "/vendor/payments" },
    { done: hours.length === 7, title: t("Working hours", "مواعيد العمل"), body: t("Set when you can confirm new requests.", "حدد الأوقات المتاحة لتأكيد الطلبات."), href: "/vendor/payments#working-hours" },
    { done: products.length > 0, title: t("First product", "المنتج الأول"), body: t("Add photos, weight and your making charge.", "أضف الصور والوزن والمصنعية الخاصة بك."), href: "/vendor/products/new" },
  ];
  const complete = checklist.filter(c => c.done).length;
  return <div className="container-pro py-8 sm:py-10" dir={ar ? "rtl" : "ltr"}>
    <section className="relative overflow-hidden rounded-3xl bg-jade-950 px-6 py-8 text-white sm:px-9">
      <div className="pointer-events-none absolute -end-12 -top-28 h-80 w-80 rounded-full border border-gold-300/20" aria-hidden /><div className="pointer-events-none absolute -end-3 -top-20 h-64 w-64 rounded-full border border-gold-300/20" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-6"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-gold-200">{t("Your Get Gold workspace", "مساحة متجرك على Get Gold")}</p><h1 className="mt-3 font-serif text-3xl sm:text-4xl">{vendor.business_name}</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">{t("A clear view of your store. Start with the orders that need you.", "كل ما تحتاجه لإدارة متجرك. ابدأ بالطلبات التي تحتاج إلى إجراء منك.")}</p><span className="mt-4 inline-flex rounded-full border border-white/20 px-3 py-1.5 text-xs">{vendor.emirate} · {vendorStatus(vendor.verification_status, ar)}</span></div><div className="flex flex-wrap gap-2"><Link href="/vendor/products/new" className="inline-flex min-h-11 items-center rounded-xl bg-gold-200 px-5 text-sm font-semibold text-jade-950">{t("+ Add a product", "+ إضافة منتج")}</Link>{vendor.verification_status === "approved" && <Link href={`/vendors/${vendor.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-white/30 px-4 text-sm">{t("View storefront", "عرض المتجر")}</Link>}</div></div>
    </section>
    <VendorNav arabic={ar} />
    {vendor.verification_status !== "approved" && <div className="mb-6 rounded-2xl border border-gold-300 bg-gold-50 p-5 text-sm leading-relaxed"><strong>{vendorStatus(vendor.verification_status, ar)}. </strong>{t("You can prepare product drafts. Your store must be approved before you submit listings or receive orders.", "يمكنك تجهيز مسودات المنتجات. يلزم اعتماد متجرك قبل إرسال المنتجات للمراجعة أو استقبال الطلبات.")}<Link className="ms-2 underline" href="/vendor/documents">{t("Manage documents", "إدارة المستندات")}</Link></div>}
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-serif text-2xl text-jade-950">{t("Your next actions", "الإجراءات التالية")}</h2><span className="text-xs text-ink-muted">{t("Updated when you open this page", "تُحدّث عند فتح هذه الصفحة")}</span></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: t("Confirm requests", "تأكيد الطلبات"), value: count("requests"), body: t("Check availability and send your final price.", "تحقق من التوفر وأرسل السعر النهائي."), href: "/vendor/orders?filter=requests", accent: true },
        { label: t("Check payments", "مراجعة المدفوعات"), value: count("payments"), body: t("Verify received funds before preparing orders.", "تحقق من استلام الأموال قبل تجهيز الطلبات."), href: "/vendor/orders?filter=payments", accent: false },
        { label: t("Prepare & fulfil", "التجهيز والتسليم"), value: count("fulfilment"), body: t("Move paid orders towards delivery or pickup.", "جهّز الطلبات المدفوعة للتوصيل أو الاستلام."), href: "/vendor/orders?filter=fulfilment", accent: false },
        { label: t("Products to finish", "منتجات تحتاج إلى إكمال"), value: drafts + attention - products.filter(p => p.product_status === "draft" && (p.data_quality_status === "blocked" || Number(p.quantity) === 0)).length, body: t("Finish drafts and review listing issues.", "أكمل المسودات وراجع ملاحظات المنتجات."), href: "/vendor/products", accent: false },
      ].map(item => <Link key={item.href} href={item.href} className={`group rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${item.accent && item.value > 0 ? "border-gold-300 bg-gold-50" : "border-jade-900/10 bg-white"}`}><p className="text-sm font-semibold text-jade-950">{item.label}<span className="float-end" aria-hidden>↗</span></p><p className="my-3 font-serif text-4xl text-jade-900">{item.value}</p><p className="text-xs leading-relaxed text-ink-muted">{item.body}</p></Link>)}
    </div>
    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="card p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-jade-600">{t("Store setup", "إعداد المتجر")}</p><h2 className="mt-2 font-serif text-2xl">{complete === checklist.length ? t("Your essentials are ready", "اكتملت الإعدادات الأساسية") : t("Make your store ready", "جهّز متجرك لاستقبال العملاء")}</h2></div><span className="rounded-full bg-jade-50 px-3 py-2 text-sm font-semibold text-jade-800">{complete}/{checklist.length}</span></div><div role="progressbar" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={complete} aria-label={t("Store setup progress", "تقدم إعداد المتجر")} className="mt-5 h-1.5 overflow-hidden rounded-full bg-jade-50"><div className="h-full rounded-full bg-jade-700" style={{ width: `${complete / checklist.length * 100}%` }} /></div><div className="mt-4 divide-y divide-jade-900/10">{checklist.map(c => <Link key={c.title} href={c.href} className="flex items-center gap-3 rounded-xl py-4 hover:bg-bone-soft"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${c.done ? "bg-jade-50 text-jade-800" : "bg-gold-100 text-gold-700"}`}>{c.done ? "✓" : "→"}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{c.title}</p><p className="mt-1 text-xs text-ink-muted">{c.body}</p></div><span className="text-xs text-jade-700">{c.done ? t("Edit", "تعديل") : t("Set up", "إعداد")}</span></Link>)}</div></section>
      <div className="space-y-5"><section className="card p-6"><p className="eyebrow text-jade-600">{t("Last 30 days", "آخر 30 يوماً")}</p><h2 className="mt-2 font-serif text-2xl">{t("Store activity", "نشاط المتجر")}</h2><dl className="mt-4 divide-y divide-jade-900/10">{[[t("Live listings now", "المنتجات المعروضة الآن"), activity?.live_listings ?? 0], [t("Purchase requests", "طلبات الشراء"), activity?.reservations_30d ?? 0], [t("Store visit requests", "طلبات زيارة المتجر"), activity?.visit_requests_30d ?? 0], [t("Offers sent", "العروض المرسلة"), activity?.request_offers_30d ?? 0]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></section><section className="rounded-2xl border border-gold-300/50 bg-gold-50 p-6"><h2 className="font-serif text-xl">{t("Need a hand with your catalogue?", "تحتاج مساعدة في إعداد الكتالوج؟")}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("Send a catalogue support request and tell us what you need help listing.", "أرسل طلب مساعدة وحدد المنتجات التي تحتاج إلى مساعدة في إضافتها.")}</p><Link className="mt-4 inline-block text-sm font-semibold text-jade-800 underline" href="/vendor/catalogue-support">{t("Get catalogue help", "طلب مساعدة للكتالوج")}</Link></section></div>
    </div>
  </div>;
}

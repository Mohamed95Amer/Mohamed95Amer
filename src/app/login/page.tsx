import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to your Get Gold account.", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; role?: string }> }) {
  const query = await searchParams;
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const vendorMode = query.role === "vendor" || (query.next?.startsWith("/vendor") ?? false);

  if (vendorMode) {
    return (
      <main className="relative overflow-hidden bg-[#f7f1e8] py-8 sm:py-12 lg:py-16" dir={arabic ? "rtl" : "ltr"}>
        <div className="pointer-events-none absolute -left-40 top-16 h-96 w-96 rounded-full bg-[#d6b66b]/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-[32rem] w-[32rem] rounded-full bg-[#0b4f42]/10 blur-3xl" />
        <div className="container-pro relative">
          <div className="mb-8 flex items-center justify-between gap-4 sm:mb-10">
            <div>
              <p className="eyebrow text-gold-700">{t("Get Gold partner portal", "بوابة شركاء Get Gold")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("Private access for approved and applying UAE jewellery businesses", "دخول خاص لمتاجر المجوهرات المعتمدة والمتقدمة بطلبات الانضمام في الإمارات")}</p>
            </div>
            <Link href="/" className="text-xs font-semibold text-jade-800 transition hover:text-jade-600">{t("Back to marketplace →", "العودة إلى السوق ←")}</Link>
          </div>
          <div className="grid overflow-hidden rounded-[2rem] border border-[#b89b61]/25 bg-[#fffdfa]/90 shadow-[0_30px_90px_rgba(32,50,43,0.13)] lg:grid-cols-[1.08fr_0.92fr]">
            <section className="relative flex min-h-[34rem] flex-col justify-between overflow-hidden bg-[#0c4138] p-7 text-white sm:p-10 lg:p-14">
              <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="absolute -right-8 -top-12 h-52 w-52 rounded-full border border-[#d6b66b]/25" />
              <div className="absolute bottom-0 left-0 h-48 w-full bg-gradient-to-t from-black/20 to-transparent" />
              <div className="relative">
                <div className="flex items-center gap-3 text-[#e3c77b]">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b66b]/50 bg-[#d6b66b]/10 text-lg">✦</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em]">{t("Vendor sign in", "دخول المتجر")}</span>
                </div>
                <h1 className="mt-9 max-w-lg font-serif text-4xl font-semibold leading-[1.04] tracking-[-0.03em] sm:text-5xl">{t("Put your shop in front of buyers ready for gold.", "اجعل متجرك أمام العملاء الباحثين عن الذهب.")}</h1>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">{t("Manage your verified store, publish live-priced listings and respond to purchase requests from one workspace.", "أدر متجرك الموثّق، وانشر منتجاتك المسعّرة وفق سعر الذهب، وتابع طلبات الشراء من لوحة واحدة.")}</p>
              </div>
              <div className="relative mt-12 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[{ n: "01", title: t("Verified presence", "حضور موثّق"), body: t("Trade-licence review helps buyers identify approved businesses.", "تساعد مراجعة الرخصة التجارية العملاء على معرفة المتاجر المعتمدة.") }, { n: "02", title: t("Transparent pricing", "أسعار واضحة"), body: t("Show karat, making, VAT and certificate costs clearly.", "اعرض العيار والمصنعية والضريبة ورسوم الشهادة بوضوح.") }, { n: "03", title: t("Direct fulfilment", "بيع مباشر"), body: t("Confirm the item and price before collecting payment directly.", "أكد القطعة والسعر قبل استلام الدفع مباشرة من العميل.") }].map((item) => (
                  <div key={item.n} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-3"><span className="text-xs font-semibold text-[#e3c77b]">{item.n}</span><h2 className="text-sm font-semibold">{item.title}</h2></div>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">{item.body}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="p-6 sm:p-10 lg:p-14">
              <div className="max-w-md">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="eyebrow text-jade-600">{t("Welcome back", "أهلاً بعودتك")}</p><h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-jade-950">{t("Vendor sign in", "دخول المتجر")}</h2></div>
                  <span className="rounded-full border border-signal-ok/25 bg-signal-ok/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-ok">{t("Secure access", "دخول آمن")}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{t("Use the email you registered for your store. Your account role and review status are applied automatically.", "استخدم البريد الإلكتروني المسجل لمتجرك. تُحدّد صلاحيات حسابك وحالة مراجعة متجرك تلقائياً.")}</p>
                <div className="mt-7 rounded-2xl border border-jade-900/10 bg-[#f6f2eb] p-4">
                  <div className="flex gap-3"><span className="mt-0.5 text-gold-700">◈</span><div><p className="text-xs font-semibold text-jade-950">{t("Your customer payments stay with your store", "مدفوعات عملائك تذهب إلى متجرك")}</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{t("Get Gold provides discovery, requests and pricing clarity. Confirm the exact item before arranging payment.", "يساعد Get Gold على عرض المنتجات واستقبال الطلبات وتوضيح الأسعار. أكد القطعة المحددة قبل ترتيب الدفع.")}</p></div></div>
                </div>
                <div className="card mt-5 border-jade-900/10 bg-white p-5 sm:p-6"><LoginForm next={query.next} error={query.error} arabic={arabic} /></div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted"><span>{t("Not listed yet?", "لم تنضم بعد؟")}</span><Link href="/register?role=vendor" className="font-semibold text-jade-700 underline underline-offset-4">{t("Apply as a vendor →", "قدّم طلب انضمام متجر ←")}</Link></div>
                <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-muted">{t("By signing in, you agree to keep listing, stock and business details accurate. Need help? ", "بتسجيل الدخول، توافق على إبقاء بيانات المنتجات والمخزون والنشاط دقيقة. تحتاج مساعدة؟ ")}<Link href="/contact" className="font-semibold text-jade-700 underline underline-offset-4">{t("Contact partner support", "تواصل مع دعم الشركاء")}</Link>.</p>
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="container-pro grid min-h-[70vh] items-center gap-10 py-12 lg:grid-cols-[1fr_0.8fr] lg:py-16" dir={arabic ? "rtl" : "ltr"}>
      <section className="hidden max-w-xl lg:block">
        <p className="eyebrow text-jade-600">{t("Your gold, in one place", "ذهبك في مكان واحد")}</p>
        <h1 className="mt-3 font-serif text-5xl font-semibold leading-tight tracking-tight text-jade-950">{t("Return to your orders and purchase insights.", "تابع طلباتك وتحليلات مشترياتك.")}</h1>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {(arabic ? ["أسعار الذهب المباشرة", "سجل المشتريات", "تقييمات موثّقة"] : ["Live gold prices", "Purchase history", "Verified reviews"]).map((item) => <div key={item} className="rounded-2xl bg-jade-50 p-4 text-sm font-semibold text-jade-900">✓ {item}</div>)}
        </div>
      </section>
      <section className="mx-auto w-full max-w-md">
        <p className="eyebrow text-jade-600 lg:hidden">{t("Welcome back", "أهلاً بعودتك")}</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{t("Sign in", "تسجيل الدخول")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("Access your Get Gold account securely.", "ادخل إلى حسابك في Get Gold بأمان.")}</p>
        <div className="card mt-6 p-6 sm:p-7"><LoginForm next={query.next} error={query.error} arabic={arabic} /></div>
        <p className="mt-4 text-sm text-ink-muted">{t("Don’t have an account? ", "ليس لديك حساب؟ ")}<Link href="/register" className="font-semibold text-jade-700 underline underline-offset-4">{t("Create one", "أنشئ حساباً")}</Link></p>
      </section>
    </div>
  );
}

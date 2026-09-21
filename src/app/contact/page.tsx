import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Get Gold for customer support, partner onboarding or marketplace safety concerns.",
  alternates: { canonical: "/contact" },
};

const contacts = [
  { label: "Customer support", detail: "Questions about a reservation, price lock or listed product.", email: "support@getgold.ae" },
  { label: "Vendor onboarding", detail: "Trade-licence verification and listing your UAE gold shop.", email: "vendors@getgold.ae" },
  { label: "Delivery partners", detail: "Delivery-company verification and future order fulfilment partnerships.", email: "delivery@getgold.ae" },
  { label: "Safety & compliance", detail: "Report suspicious listings, payment requests or account activity.", email: "compliance@getgold.ae" },
];

export default async function ContactPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = arabic ? { eyebrow: "نحن هنا للمساعدة", title: "تواصل مع فريق Get Gold المناسب.", intro: "اختر القناة التي تناسب سؤالك وأرفق رقم الحجز عند الحاجة.", support: "دعم العملاء", vendor: "تسجيل المتاجر", delivery: "شركاء التوصيل", safety: "السلامة والامتثال", payment: "سلامة الدفع:", paymentBody: "لا تطلب Get Gold أبداً بيانات البطاقة أو رموز OTP أو بيانات البنك عبر البريد الإلكتروني. يبقى المتجر هو البائع المسؤول؛ تحقق من اسم المتجر وتفاصيل الحجز قبل الدفع.", policy: "للتوصيل والإلغاء ومسؤوليات السوق، راجع الشروط والسياسات" } : { eyebrow: "We are here to help", title: "Talk to the right Get Gold team.", intro: "Choose the channel that matches your question and include your reservation number when applicable.", support: "Customer support", vendor: "Vendor onboarding", delivery: "Delivery partners", safety: "Safety & compliance", payment: "Payment safety:", paymentBody: "Get Gold never asks for card details, OTPs or bank credentials by email. A vendor remains the seller of record; verify the vendor name and reservation details before paying any link.", policy: "For delivery, cancellation and marketplace responsibilities, review our terms and policies" };
  const localizedContacts = arabic ? [{ ...contacts[0], label: t.support }, { ...contacts[1], label: t.vendor }, { ...contacts[2], label: t.delivery }, { ...contacts[3], label: t.safety }] : contacts;
  return (
    <>
      <section className="bg-jade-950 text-white">
        <div className="container-pro py-14 sm:py-20">
          <p className="eyebrow text-gold-200">{t.eyebrow}</p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl font-semibold tracking-tight sm:text-6xl">{t.title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">{t.intro}</p>
        </div>
      </section>

      <div className="container-pro py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {localizedContacts.map((contact, index) => (
            <a key={contact.label} href={`mailto:${contact.email}`} className="card group flex min-h-52 flex-col p-6 transition hover:-translate-y-1 hover:border-gold-300 hover:shadow-lift">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-jade-100 font-serif text-lg text-jade-800">{index + 1}</span>
              <h2 className="mt-5 font-serif text-2xl font-semibold text-jade-950">{contact.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{contact.detail}</p>
              <span className="mt-auto pt-5 text-sm font-semibold text-jade-700 group-hover:text-jade-500">{contact.email} →</span>
            </a>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-gold-400/25 bg-gold-50 p-5 text-sm leading-relaxed text-ink-muted sm:p-6">
          <strong className="text-jade-950">{t.payment}</strong> {t.paymentBody}
        </div>

        <p className="mt-8 text-sm text-ink-muted">{t.policy} <Link href="/terms" className="font-semibold text-jade-700 underline underline-offset-4">{arabic ? "الشروط والسياسات" : "terms and policies"}</Link>.</p>
      </div>
    </>
  );
}

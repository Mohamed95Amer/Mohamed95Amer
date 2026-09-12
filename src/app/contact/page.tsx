import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Get Gold for customer support, partner onboarding or marketplace safety concerns.",
  alternates: { canonical: "/contact" },
};

const contacts = [
  { label: "Customer support", detail: "Questions about a reservation, price lock or listed product.", email: "support@getgold.app" },
  { label: "Vendor onboarding", detail: "Trade-licence verification and listing your UAE gold shop.", email: "vendors@getgold.app" },
  { label: "Delivery partners", detail: "Delivery-company verification and future order fulfilment partnerships.", email: "delivery@getgold.app" },
  { label: "Safety & compliance", detail: "Report suspicious listings, payment requests or account activity.", email: "support@getgold.app" },
];

export default function ContactPage() {
  return (
    <>
      <section className="bg-jade-950 text-white">
        <div className="container-pro py-14 sm:py-20">
          <p className="eyebrow text-gold-200">We are here to help</p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl font-semibold tracking-tight sm:text-6xl">Talk to the right Get Gold team.</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">Choose the channel that matches your question and include your reservation number when applicable.</p>
        </div>
      </section>

      <div className="container-pro py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {contacts.map((contact, index) => (
            <a key={contact.label} href={`mailto:${contact.email}`} className="card group flex min-h-52 flex-col p-6 transition hover:-translate-y-1 hover:border-gold-300 hover:shadow-lift">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-jade-100 font-serif text-lg text-jade-800">{index + 1}</span>
              <h2 className="mt-5 font-serif text-2xl font-semibold text-jade-950">{contact.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{contact.detail}</p>
              <span className="mt-auto pt-5 text-sm font-semibold text-jade-700 group-hover:text-jade-500">{contact.email} →</span>
            </a>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-gold-400/25 bg-gold-50 p-5 text-sm leading-relaxed text-ink-muted sm:p-6">
          <strong className="text-jade-950">Payment safety:</strong> Get Gold never asks for card details, OTPs or bank credentials by email. A vendor remains the seller of record; verify the vendor name and reservation details before paying any link.
        </div>

        <p className="mt-8 text-sm text-ink-muted">For delivery, cancellation and marketplace responsibilities, review our <Link href="/terms" className="font-semibold text-jade-700 underline underline-offset-4">terms and policies</Link>.</p>
      </div>
    </>
  );
}

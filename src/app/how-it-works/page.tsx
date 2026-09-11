import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "How GoldHub works",
  description: "From verified listing and live gold price to a locked reservation with a UAE gold shop.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  const steps = [
    ["Find", "Compare verified stock", "Browse approved jewellery and bullion. Each total follows the same live 24K reference, while making and certificate costs stay clearly separated."],
    ["Check", "Understand the value", "See the product-karat rate, gold weight, GoldHub Value Score, store rating and every charge before taking action."],
    ["Lock", "Reserve the current price", `The server recalculates the order using a quote rechecked every ${env.refreshIntervalSeconds()} seconds. If it reaches ${env.stalePriceSeconds()} seconds old, reservations pause until a fresh quote arrives.`],
    ["Confirm", "The store checks availability", "The selected vendor receives the reservation and confirms that the exact item is ready. Your price lock lasts 10 minutes."],
    ["Complete", "Pay the seller and receive your gold", "The vendor, as seller of record, arranges its payment link, collection or delivery and provides the applicable invoice and product documents."],
  ];

  return (
    <>
      <section className="bg-jade-950 text-white">
        <div className="container-pro py-14 text-center sm:py-20">
          <p className="eyebrow text-gold-200">Five clear steps</p>
          <h1 className="mx-auto mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-tight sm:text-6xl">From live gold price to confirmed purchase.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">GoldHub provides discovery, verification and price transparency. The listed jeweller owns the inventory and remains the seller.</p>
        </div>
      </section>

      <div className="container-pro py-12 sm:py-16">
        <ol className="relative grid gap-4 lg:grid-cols-5">
          {steps.map(([eyebrow, title, body], index) => (
            <li key={title} className="card relative p-6">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-jade-600">{eyebrow}</span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-100 font-serif text-gold-600">{index + 1}</span>
              </div>
              <h2 className="mt-6 font-serif text-xl font-semibold text-jade-950">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-10 rounded-[2rem] border border-gold-300/30 bg-gold-50 p-6 sm:p-8">
          <p className="eyebrow text-gold-600">Payment-link safety</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-jade-950">Check before you pay.</h2>
          <ul className="mt-4 grid gap-3 text-sm text-ink-muted sm:grid-cols-3">
            <li>Match the store name and reservation details.</li>
            <li>Never share an OTP or banking password.</li>
            <li>Contact GoldHub if the amount or sender looks different.</li>
          </ul>
        </section>

        <div className="mt-10 text-center">
          <Link href="/marketplace" className="btn-primary">Explore the marketplace</Link>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust & verification",
  description: "How Get Gold verifies UAE gold shops, reviews listings and protects live-price reservations.",
  alternates: { canonical: "/trust" },
};

const checks = [
  ["01", "Business identity", "We review the shop's UAE trade licence, owner identity, contact information and store address before approval."],
  ["02", "Listing evidence", "Weight, karat, hallmark and certificate or assay information are reviewed before a listing becomes public."],
  ["03", "Transparent pricing", "Gold value, making, certificates, stones, vendor premium, Get Gold fee and delivery are separated so the total can be understood."],
  ["04", "Fresh-price protection", "The official price is recomputed on the server. Reservations pause automatically when the market reference is too old."],
  ["05", "Stock protection", "A database lock prevents two customers from reserving the final unit at the same time."],
  ["06", "Verified reviews", "Only completed purchasers can review. Store replies and reports are moderated separately from courier performance."],
];

export default function TrustPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-jade-950 text-white">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-gold-300/20" />
        <div className="container-pro relative py-14 sm:py-20">
          <p className="eyebrow text-gold-200">Evidence over promises</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-tight sm:text-6xl">Trust built into every listing and reservation.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">Get Gold verifies who is selling, shows how the price is formed and preserves the exact market snapshot used for every reservation.</p>
        </div>
      </section>

      <div className="container-pro py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {checks.map(([number, title, description]) => (
            <article key={number} className="card p-6">
              <span className="font-serif text-3xl text-gold-500">{number}</span>
              <h2 className="mt-5 font-serif text-2xl font-semibold text-jade-950">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
            </article>
          ))}
        </div>

        <section className="mt-10 grid gap-6 rounded-[2rem] bg-jade-50 p-6 sm:p-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow text-jade-600">What “verified” means</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold text-jade-950">A checked business, not a guarantee of investment returns.</h2>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
            <p>Verification confirms the evidence available at review time. The vendor still owns the product, fulfils the order and remains the seller of record.</p>
            <p>Get Gold Value Score compares disclosed non-gold costs with live gold value. It is not an appraisal, craftsmanship score or resale forecast.</p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/marketplace" className="btn-primary">Browse verified listings</Link>
          <Link href="/contact" className="btn-ghost">Report a concern</Link>
        </div>
      </div>
    </>
  );
}

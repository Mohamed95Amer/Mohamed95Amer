import type { Metadata } from "next";
import Link from "next/link";
import { BuyerRequestForm } from "@/components/BuyerRequestForm";

export const metadata: Metadata = { title: "Request a gold piece", description: "Tell verified UAE gold stores what you want and compare their offers." };

export default function NewBuyerRequestPage() {
  return (
    <main className="container-pro max-w-4xl py-10 sm:py-14">
      <p className="eyebrow text-jade-600">Get Gold Request</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950 sm:text-5xl">Can’t find it? Let stores find it for you.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">Share the style, purity, budget and timing once. Verified UAE jewellers can respond without making you visit every shop in the souq.</p>
      <div className="mt-8"><BuyerRequestForm /></div>
      <p className="mt-5 text-sm text-ink-muted">Already submitted? <Link href="/account/requests" className="font-semibold text-jade-700 underline">View your requests</Link></p>
    </main>
  );
}

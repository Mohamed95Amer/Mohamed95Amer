import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { KaratRateView, karatDescription, karatTitle } from "@/components/gold-rate/RatePageView";
import { RATE_KARATS, rateKaratBySlug } from "@/lib/gold-rate/core";
import { loadRateSnapshot } from "@/lib/gold-rate/data";
import { rateMetadata } from "@/lib/gold-rate/metadata";

export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return RATE_KARATS.map((item) => ({ karat: item.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ karat: string }> }): Promise<Metadata> {
  const karat = rateKaratBySlug((await params).karat);
  if (!karat) return {};
  return rateMetadata("en", karat, karatTitle(karat, "en"), karatDescription(karat, "en"));
}

export default async function KaratRatePage({ params }: { params: Promise<{ karat: string }> }) {
  const karat = rateKaratBySlug((await params).karat);
  if (!karat) notFound();
  return <KaratRateView locale="en" karat={karat} snapshot={await loadRateSnapshot()} />;
}

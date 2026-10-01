import { RateHubView } from "@/components/gold-rate/RatePageView";
import { loadRateSnapshot } from "@/lib/gold-rate/data";
import { hubMetadata } from "@/lib/gold-rate/metadata";

export const dynamic = "force-dynamic";
export const metadata = hubMetadata("en");

export default async function GoldRateHubPage() {
  return <RateHubView locale="en" snapshot={await loadRateSnapshot()} />;
}

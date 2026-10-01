import { RateHubView } from "@/components/gold-rate/RatePageView";
import { loadRateSnapshot } from "@/lib/gold-rate/data";
import { hubMetadata } from "@/lib/gold-rate/metadata";

export const dynamic = "force-dynamic";
export const metadata = hubMetadata("ar");

export default async function ArabicGoldRateHubPage() {
  return <RateHubView locale="ar" snapshot={await loadRateSnapshot()} />;
}

import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/server";
import { allRows } from "@/lib/admin/data";
import type { Campaign } from "@/lib/notifications/campaigns";
import { CampaignManager } from "./CampaignManager";
export default async function AdminNotificationsPage() {
  await requireAdmin();
  const campaigns = await allRows<Campaign>(
    "notification_campaigns",
    "id,title,body,title_ar,body_ar,href,audience,starts_at,ends_at,published_at,cancelled_at",
  );
  return (
    <CampaignManager
      campaigns={campaigns.sort((a, b) =>
        b.starts_at.localeCompare(a.starts_at),
      )}
      arabic={(await cookies()).get("gg_lang")?.value === "ar"}
    />
  );
}

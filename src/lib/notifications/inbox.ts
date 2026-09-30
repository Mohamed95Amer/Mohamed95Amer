import { cache } from "react";
import { getServiceSupabase } from "@/lib/supabase/server";
export type InboxCampaign = {
  id: string;
  title: string;
  body: string;
  title_ar: string | null;
  body_ar: string | null;
  href: string;
  starts_at: string;
  ends_at: string;
  read_at: string | null;
};

export const getUnreadNotificationCount = cache(async (userId: string) => {
  const db = getServiceSupabase();
  const result = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .lte("available_at", new Date().toISOString());
  if (result.error) throw new Error("Notification count could not be loaded.");
  return result.count ?? 0;
});

export const getInboxSummary = cache(async (userId: string) => {
  const db = getServiceSupabase();
  const [count, campaigns] = await Promise.all([
    getUnreadNotificationCount(userId),
    db.rpc("customer_campaign_inbox", { p_user_id: userId }),
  ]);
  if (campaigns.error)
    throw new Error("Notification inbox could not be loaded.");
  const offers = (campaigns.data ?? []) as InboxCampaign[];
  return {
    unread: count + offers.filter((c) => !c.read_at).length,
    campaigns: offers,
  };
});

import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminMarketingControls } from "./AdminMarketingControls";

export const dynamic = "force-dynamic";

export default async function AdminMarketingPage() {
  const admin = getServiceSupabase();
  const [{ data: campaigns }, { data: banners }] = await Promise.all([
    admin.from("marketplace_promotions").select("id, title, service_fee_discount_percent, delivery_discount_percent, starts_at, ends_at, cancelled_at").order("created_at", { ascending: false }).limit(50),
    admin.from("site_banners").select("id, title, placement, image_path, media_type, starts_at, ends_at, cancelled_at").order("created_at", { ascending: false }).limit(50),
  ]);
  return <AdminMarketingControls campaigns={campaigns ?? []} banners={banners ?? []} />;
}

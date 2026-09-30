import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminSettingsForm } from "./AdminSettingsForm";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data } = await admin.from("platform_settings").select("*").eq("id", true).single();
  return (
    <div className="card p-6 max-w-xl" dir={arabic ? "rtl" : "ltr"}>
      <h2 className="font-serif text-xl">{arabic ? "إعدادات المنصة" : "Platform settings"}</h2>
      <p className="text-sm text-ink-muted mt-1">
        {arabic ? "تُطبّق هذه الإعدادات على السوق كله. يحدد حد صلاحية السعر متى تتوقف أزرار طلب الشراء." : "These apply marketplace-wide. The stale-price window controls when purchase-request buttons are disabled."}
      </p>
      <div className="mt-6">
        <AdminSettingsForm initial={data} arabic={arabic} />
      </div>
    </div>
  );
}

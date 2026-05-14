import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminSettingsForm } from "./AdminSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = getServiceSupabase();
  const { data } = await admin.from("platform_settings").select("*").eq("id", true).single();
  return (
    <div className="card p-6 max-w-xl">
      <h2 className="font-serif text-xl">Platform settings</h2>
      <p className="text-sm text-ink-muted mt-1">
        These apply marketplace-wide. The stale-price window controls when reservation buttons are disabled.
      </p>
      <div className="mt-6">
        <AdminSettingsForm initial={data} />
      </div>
    </div>
  );
}

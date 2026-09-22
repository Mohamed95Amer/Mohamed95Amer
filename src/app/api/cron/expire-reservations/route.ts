import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/security/cron";
import { processDuePriceAlerts } from "@/lib/alerts/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "expired" })
    .lt("expires_at", new Date().toISOString())
    .in("status", ["pending_vendor_confirmation", "vendor_confirmed", "payment_link_pending", "payment_pending"])
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Funnel events are aggregate product signals, not a permanent user dossier.
  // Keep roughly 13 months for seasonality and remove older rows.
  const { error: retentionError } = await supabase.from("marketplace_events").delete().lt("occurred_at", new Date(Date.now() - 400 * 86_400_000).toISOString());
  const alerts = await processDuePriceAlerts();
  return NextResponse.json({ expiredCount: data?.length ?? 0, alerts, analyticsRetentionOk: !retentionError });
}

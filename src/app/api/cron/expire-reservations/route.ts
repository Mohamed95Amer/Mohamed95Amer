import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/security/cron";

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
    .in("status", ["pending_vendor_confirmation", "payment_link_pending", "payment_pending"])
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ expiredCount: data?.length ?? 0 });
}

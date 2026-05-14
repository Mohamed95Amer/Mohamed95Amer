import { NextResponse } from "next/server";
import { refreshGoldPrice } from "@/lib/gold-price/service";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-triggered manual refresh. Requires the caller to be authenticated
 * and to have the admin or super_admin role.
 */
export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const outcome = await refreshGoldPrice();

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    actor_role: profile.role,
    action: "gold_price.manual_refresh",
    entity_type: "gold_price_tick",
    entity_id: outcome.tick ? String(outcome.tick.id) : null,
    new_value: { attempts: outcome.attempts, tick: outcome.tick },
    ip_address: request.headers.get("x-forwarded-for") ?? null,
  });

  return NextResponse.json(outcome);
}

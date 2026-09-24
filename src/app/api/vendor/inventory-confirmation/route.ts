import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { inventoryConfirmationSchema } from "@/lib/validation/schemas";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = inventoryConfirmationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", auth.user.id).maybeSingle();
  if (!vendor) return NextResponse.json({ error: "vendor_required" }, { status: 403 });
  let query = admin.from("products").update({ inventory_confirmed_at: new Date().toISOString() }).eq("vendor_id", vendor.id).eq("product_status", "approved");
  if (parsed.data.productId) query = query.eq("id", parsed.data.productId);
  const { data, error } = await query.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actor_user_id: auth.user.id, actor_role: "vendor", action: "inventory.confirmed", entity_type: parsed.data.productId ? "product" : "vendor", entity_id: parsed.data.productId ?? vendor.id, new_value: { confirmed_count: data?.length ?? 0 }, ip_address: ipFromRequest(request) });
  return NextResponse.json({ confirmed: data?.length ?? 0 });
}

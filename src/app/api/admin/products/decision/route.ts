import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { adminProductDecisionSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { productIntegrityIssues } from "@/lib/products/integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminProductDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const nextStatus =
    parsed.data.decision === "approve" ? "approved" :
    parsed.data.decision === "reject" ? "rejected" : "suspended";

  const { data: prev } = await admin.from("products").select("*").eq("id", parsed.data.productId).single();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (parsed.data.decision === "approve") {
    const issues = productIntegrityIssues({
      ...prev,
      weight_grams: Number(prev.weight_grams),
      quantity: Number(prev.quantity),
      making_charge: Number(prev.making_charge),
      making_charge_discount_percent: Number(prev.making_charge_discount_percent),
      certificate_fee: Number(prev.certificate_fee),
      images: Array.isArray(prev.images) ? prev.images : [],
    });
    if (issues.length > 0) {
      await admin.from("products").update({ data_quality_status: "blocked", data_quality_issues: issues, last_quality_checked_at: new Date().toISOString() }).eq("id", parsed.data.productId);
      return NextResponse.json({ error: "listing_integrity_failed", issues }, { status: 409 });
    }
  }
  const { error } = await admin
    .from("products")
    .update({
      product_status: nextStatus,
      admin_notes: parsed.data.note ?? null,
      ...(nextStatus === "approved" ? { inventory_confirmed_at: new Date().toISOString(), data_quality_status: "valid", data_quality_issues: [] } : {}),
    })
    .eq("id", parsed.data.productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: profile.role,
    action: `product.${parsed.data.decision}`,
    entity_type: "product",
    entity_id: parsed.data.productId,
    old_value: { product_status: prev?.product_status },
    new_value: { product_status: nextStatus, note: parsed.data.note ?? null },
    ip_address: ipFromRequest(request),
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}

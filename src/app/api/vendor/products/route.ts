import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { productUpsertSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return upsert(request);
}

export async function PUT(request: Request) {
  return upsert(request);
}

async function upsert(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, verification_status")
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (!vendor) return NextResponse.json({ error: "no_vendor" }, { status: 403 });

  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = productUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, submit_for_approval, ...rest } = parsed.data;

  // Vendors cannot submit for approval unless their account is approved.
  let status: "draft" | "pending_approval" = "draft";
  if (submit_for_approval) {
    if (vendor.verification_status !== "approved") {
      return NextResponse.json({ error: "vendor_not_approved" }, { status: 403 });
    }
    status = "pending_approval";
  }

  if (id) {
    // Ensure ownership
    const { data: existing } = await admin
      .from("products")
      .select("id, vendor_id, product_status")
      .eq("id", id)
      .single();
    if (!existing || existing.vendor_id !== vendor.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Vendors can move between draft <-> pending_approval. Approved/suspended only admins.
    const newStatus =
      existing.product_status === "approved" || existing.product_status === "suspended"
        ? existing.product_status
        : status;
    const { error } = await admin
      .from("products")
      .update({ ...rest, product_status: newStatus })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({
      actor_user_id: auth.user.id,
      actor_role: "vendor",
      action: "product.updated",
      entity_type: "product",
      entity_id: id,
      new_value: { ...rest, product_status: newStatus },
      ip_address: ipFromRequest(request),
    });
    return NextResponse.json({ id, status: newStatus });
  }

  const { data, error } = await admin
    .from("products")
    .insert({ ...rest, vendor_id: vendor.id, product_status: status })
    .select("id, product_status")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: "product.created",
    entity_type: "product",
    entity_id: data.id,
    new_value: { ...rest, product_status: status },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ id: data.id, status: data.product_status });
}

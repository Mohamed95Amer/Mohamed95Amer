import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { productUpsertSchema } from "@/lib/validation/schemas";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";
import { productIntegrityIssues } from "@/lib/products/integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return upsert(request);
}

export async function PUT(request: Request) {
  return upsert(request);
}

async function upsert(request: Request) {
  const userClient = await getServerSupabase();
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
  const { id, submit_for_approval, vat_choice_confirmed, ...rest } = parsed.data;
  const integrityIssues = productIntegrityIssues(rest);

  // Vendors cannot submit for approval unless their account is approved.
  let status: "draft" | "pending_approval" = "draft";
  if (submit_for_approval) {
    if (vendor.verification_status !== "approved") {
      return NextResponse.json({ error: "vendor_not_approved" }, { status: 403 });
    }
    if (integrityIssues.length > 0) {
      return NextResponse.json({ error: "listing_integrity_failed", issues: integrityIssues }, { status: 400 });
    }
    status = "pending_approval";
  }

  if (id) {
    // Ensure ownership
    const { data: existing } = await admin
      .from("products")
      .select("id, vendor_id, product_status, vat_rate_bps, updated_at")
      .eq("id", id)
      .single();
    if (!existing || existing.vendor_id !== vendor.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // A tax change must be reviewed again before a previously approved item is sold.
    // Suspended listings must never be reactivated by a vendor edit.
    const taxChanged = Number(existing.vat_rate_bps) !== rest.vat_rate_bps;
    const newStatus =
      existing.product_status === "suspended" || (existing.product_status === "approved" && !taxChanged)
        ? existing.product_status
        : status;
    if (newStatus === "approved" && integrityIssues.length > 0) {
      return NextResponse.json({ error: "listing_integrity_failed", issues: integrityIssues }, { status: 400 });
    }
    const { data: updated, error } = await admin
      .from("products")
      .update({
        ...rest,
        product_status: newStatus,
        inventory_confirmed_at: new Date().toISOString(),
        data_quality_status: integrityIssues.length === 0 ? "valid" : "blocked",
        data_quality_issues: integrityIssues,
        last_quality_checked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("vendor_id", vendor.id)
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "This listing changed while you were saving. Reload it and try again." }, { status: 409 });
    await logAudit({
      actor_user_id: auth.user.id,
      actor_role: "vendor",
      action: "product.updated",
      entity_type: "product",
      entity_id: id,
      new_value: { ...rest, vat_choice_confirmed, product_status: newStatus },
      ip_address: ipFromRequest(request),
    });
    return NextResponse.json({ id, status: newStatus });
  }

  const { data, error } = await admin
    .from("products")
    .insert({
      ...rest,
      vendor_id: vendor.id,
      product_status: status,
      inventory_confirmed_at: new Date().toISOString(),
      data_quality_status: integrityIssues.length === 0 ? "valid" : "blocked",
      data_quality_issues: integrityIssues,
      last_quality_checked_at: new Date().toISOString(),
    })
    .select("id, product_status")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  await logAudit({
    actor_user_id: auth.user.id,
    actor_role: "vendor",
    action: "product.created",
    entity_type: "product",
    entity_id: data.id,
    new_value: { ...rest, vat_choice_confirmed, product_status: status },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ id: data.id, status: data.product_status });
}

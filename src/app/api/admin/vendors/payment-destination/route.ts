import { NextResponse } from "next/server";
import { z } from "zod";
import { adminContext } from "@/lib/admin/context";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  vendorId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "reject" && !value.note) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Explain what the vendor must correct." });
  }
});

export async function POST(request: Request) {
  const context = await adminContext();
  if (!context) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_input" }, { status: 400 });

  const { data: current, error: loadError } = await context.db.from("vendor_payment_settings")
    .select("vendor_id, aani_enabled, aani_mobile, bank_transfer_enabled, bank_name, beneficiary_name, iban, destination_verification_status")
    .eq("vendor_id", parsed.data.vendorId)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: "load_failed" }, { status: 500 });
  if (!current || (!current.aani_enabled && !current.bank_transfer_enabled)) {
    return NextResponse.json({ error: "No direct-transfer destination is awaiting review." }, { status: 409 });
  }

  const reviewedAt = new Date().toISOString();
  const status = parsed.data.decision === "approve" ? "approved" : "rejected";
  const { error } = await context.db.from("vendor_payment_settings").update({
    destination_verification_status: status,
    destination_verified_at: reviewedAt,
    destination_verified_by: context.user.id,
    destination_review_note: parsed.data.note || null,
  }).eq("vendor_id", parsed.data.vendorId);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  await logAudit({
    actor_user_id: context.user.id,
    actor_role: "admin",
    action: `vendor.payment_destination_${status}`,
    entity_type: "vendor",
    entity_id: parsed.data.vendorId,
    old_value: { destination_verification_status: current.destination_verification_status },
    new_value: {
      destination_verification_status: status,
      aani_enabled: current.aani_enabled,
      aani_mobile_last3: current.aani_enabled ? current.aani_mobile.slice(-3) : null,
      bank_transfer_enabled: current.bank_transfer_enabled,
      iban_last4: current.bank_transfer_enabled ? current.iban.slice(-4) : null,
      note: parsed.data.note || null,
    },
    ip_address: ipFromRequest(request),
  });
  return NextResponse.json({ ok: true, status });
}

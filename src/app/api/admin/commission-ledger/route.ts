import { NextResponse } from "next/server";
import { z } from "zod";
import { adminContext } from "@/lib/admin/context";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    id: z.string().uuid(),
    vendorId: z.string().uuid(),
    kind: z.enum(["receipt", "credit", "debit"]),
    amount: z.number().positive().max(10000000).multipleOf(0.01),
    note: z.string().trim().min(5).max(500),
    reference: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("void"),
    id: z.string().uuid(),
    note: z.string().trim().min(5).max(500),
  }),
]);
export async function POST(request: Request) {
  const ctx = await adminContext();
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "Enter a positive amount with up to two decimals and a reason of at least 5 characters.",
      },
      { status: 400 },
    );
  const v = parsed.data;
  if (v.action === "create" && v.kind === "receipt" && !v.reference?.trim())
    return NextResponse.json(
      { error: "Add a bank or receipt reference for this payment." },
      { status: 400 },
    );
  const { error } = await ctx.db.rpc("manage_commission_entry", {
    p_actor: ctx.user.id,
    p_action: v.action,
    p_id: v.id,
    p_note: v.note,
    ...(v.action === "create"
      ? {
          p_vendor: v.vendorId,
          p_kind: v.kind,
          p_amount: v.amount,
          p_reference: v.reference || null,
        }
      : {}),
  });
  if (error) {
    console.error("Commission mutation failed", error.code);
    return NextResponse.json(
      {
        error:
          "Entry changed or could not be saved. Refresh and check the ledger before retrying.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

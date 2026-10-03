import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { bulkProductUploadSchema } from "@/lib/validation/schemas";
import { logAuditMany } from "@/lib/audit";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { parseBulkProducts, bulkTemplateCsv, BULK_MAX_ROWS } from "@/lib/products/bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the template. Same column list the importer reads, by construction,
 * so the file handed out can never disagree with the file accepted.
 *
 * The content is a fixed header row and holds nothing private, but it still
 * requires a session: every other route under /api/vendor does, and an open
 * endpoint among them is the kind of inconsistency that later gets copied.
 */
export async function GET() {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return new NextResponse(bulkTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="getgold-products-template.csv"',
      // The columns change only with a deploy, but a stale template silently
      // produces "unrecognised column" errors, so it is not worth caching.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Validate a CSV of products and, when asked to commit, insert them.
 *
 * Two properties this has to hold to:
 *
 *  - Nothing is inserted unless every row is good. A spreadsheet is edited and
 *    re-uploaded as a whole; a partial import leaves the vendor unable to tell
 *    which products landed, and re-uploading the fixed file would duplicate
 *    the ones that did.
 *  - A dry run writes nothing at all, so the vendor can check a file freely.
 */
export async function POST(request: Request) {
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
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bulkProductUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { csv, commit, submit_for_approval } = parsed.data;

  // Keyed on the vendor rather than the IP: a shop behind one office NAT
  // should not lock out its neighbours, and the cost here is per-account.
  //
  // Checks and commits are counted separately on purpose. Re-checking a file
  // is the loop a vendor is *supposed* to run — upload, read the errors, fix,
  // upload again — so a limit tight enough to matter for writes would punish
  // exactly that. Commits are the ones that create rows, so those are tighter.
  const hour = 60 * 60 * 1000;
  const limit = commit
    ? rateLimit(`bulk-products:commit:${auth.user.id}`, 20, hour)
    : rateLimit(`bulk-products:check:${auth.user.id}`, 120, hour);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: commit
          ? "Too many bulk uploads in the last hour. Try again later."
          : "Too many file checks in the last hour. Try again later.",
      },
      { status: 429 },
    );
  }

  // Checked before parsing: an unapproved vendor should be told why up front,
  // not after fixing every row in the file.
  let status: "draft" | "pending_approval" = "draft";
  if (submit_for_approval) {
    if (vendor.verification_status !== "approved") {
      return NextResponse.json({ error: "vendor_not_approved" }, { status: 403 });
    }
    status = "pending_approval";
  }

  const result = parseBulkProducts(csv);

  if (result.issues.length > 0) {
    return NextResponse.json({
      ok: false,
      committed: false,
      row_count: result.rows.length,
      issues: result.issues,
    });
  }

  if (!commit) {
    return NextResponse.json({
      ok: true,
      committed: false,
      row_count: result.rows.length,
      issues: [],
      preview: result.rows.slice(0, 5).map((r) => ({ line: r.line, ...r.product })),
    });
  }

  // One statement, so either every product is created or none is. Also the
  // reason BULK_MAX_ROWS exists: this bounds the statement, not a loop.
  const toInsert = result.rows.slice(0, BULK_MAX_ROWS).map((r) => ({
    ...r.product,
    vendor_id: vendor.id,
    product_status: status,
  }));

  const { data: inserted, error } = await admin
    .from("products")
    .insert(toInsert)
    .select("id, name");
  if (error || !inserted) {
    return NextResponse.json(
      { error: "insert_failed", message: error?.message ?? "Could not create the products." },
      { status: 500 },
    );
  }

  const ip = ipFromRequest(request);
  await logAuditMany(
    inserted.map((p: { id: string; name: string }) => ({
      actor_user_id: auth.user!.id,
      actor_role: "vendor",
      action: "product.created",
      entity_type: "product",
      entity_id: p.id,
      new_value: { name: p.name, product_status: status, source: "bulk_csv" },
      ip_address: ip,
    })),
  );

  return NextResponse.json({
    ok: true,
    committed: true,
    row_count: inserted.length,
    status,
    issues: [],
  });
}

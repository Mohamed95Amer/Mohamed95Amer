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
  const userClient = await getServerSupabase();
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
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bulkProductUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { csv, commit } = parsed.data;

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
  //
  // Always a draft. A CSV carries no photograph, and the catalogue integrity
  // gate requires one before a product may be submitted or approved — the
  // products table has a trigger that raises on a pending_approval row which
  // fails it. Since this is a single statement, offering "submit for approval"
  // here would not merely be refused per row: it would abort the whole upload.
  // So the vendor opens each product to add photos and a description, and
  // submits it there.
  const toInsert = result.rows.slice(0, BULK_MAX_ROWS).map((r) => ({
    ...r.product,
    vendor_id: vendor.id,
    product_status: "draft" as const,
    inventory_confirmed_at: new Date().toISOString(),
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
      new_value: { name: p.name, product_status: "draft", source: "bulk_csv" },
      ip_address: ip,
    })),
  );

  return NextResponse.json({
    ok: true,
    committed: true,
    row_count: inserted.length,
    status: "draft",
    issues: [],
  });
}

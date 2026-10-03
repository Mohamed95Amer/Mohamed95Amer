/**
 * Checks for the bulk upload route in src/app/api/vendor/products/bulk.
 *
 * Run with: npm test
 *
 * These run the real handler against a recording Supabase stub, because the
 * things worth asserting here are not about the response shape but about what
 * reached the database: that an unauthorised caller writes nothing, that a
 * dry run writes nothing, that a file with any bad row writes nothing, and
 * that a good file is written in a single statement so a failure part-way
 * cannot leave a vendor with half a catalogue.
 */
import { POST, GET } from "@/app/api/vendor/products/bulk/route";
import { stub, resetStub } from "./stubs/supabase.ts";
import { eq, section, report } from "./harness.ts";

const HEADER = "name,category,karat,weight_grams";
const GOOD = HEADER + "\nRing A,ring,22,1.5\nRing B,bangle,18,10";
const BAD = HEADER + "\nRing A,ring,22,1.5\nRing B,bangle,99,10";

const VENDOR = { id: "vendor-1", verification_status: "approved" };
const UNAPPROVED = { id: "vendor-1", verification_status: "pending" };

function post(body: unknown): Request {
  return new Request("http://localhost/api/vendor/products/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Products actually inserted across all statements. */
const insertedProducts = () =>
  stub.inserts.filter((i) => i.table === "products").flatMap((i) => i.rows);
/** How many separate insert statements hit products. One, or none. */
const productStatements = () => stub.inserts.filter((i) => i.table === "products").length;

async function call(body: unknown) {
  const res = await POST(post(body));
  return { status: res.status, body: await res.json() };
}

section("authorization");
{
  resetStub({ user: null, vendor: VENDOR });
  const r = await call({ csv: GOOD, commit: true });
  eq("no session is refused", r.status, 401);
  eq("  and writes nothing", stub.inserts, []);
}
{
  resetStub({ user: { id: "u1" }, vendor: null });
  const r = await call({ csv: GOOD, commit: true });
  eq("a user with no vendor is refused", r.status, 403);
  eq("  and writes nothing", stub.inserts, []);
}
{
  resetStub({ user: { id: "u1" }, vendor: UNAPPROVED });
  const r = await call({ csv: GOOD, commit: true, submit_for_approval: true });
  eq("an unapproved vendor cannot submit for approval", r.body.error, "vendor_not_approved");
  eq("  and writes nothing", stub.inserts, []);
}
{
  // An unapproved vendor may still build up drafts; that is the whole point of
  // the draft state, and blocking it would leave them nothing to do while
  // waiting for verification.
  resetStub({ user: { id: "u1" }, vendor: UNAPPROVED });
  const r = await call({ csv: GOOD, commit: true });
  eq("an unapproved vendor can create drafts", r.status, 200);
  eq("  as drafts", (insertedProducts()[0] as { product_status: string }).product_status, "draft");
}

section("a dry run writes nothing");
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: GOOD });
  eq("reports what would be created", [r.body.ok, r.body.committed, r.body.row_count], [true, false, 2]);
  eq("  writes nothing", stub.inserts, []);
  eq("  previews rows with their line numbers", r.body.preview.map((p: { line: number }) => p.line), [2, 3]);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: BAD });
  eq("a bad file is reported, not thrown", [r.status, r.body.ok], [200, false]);
  eq("  with the row and column", [r.body.issues[0].line, r.body.issues[0].column], [3, "karat"]);
  eq("  writes nothing", stub.inserts, []);
}

section("commit is all or nothing");
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: BAD, commit: true });
  eq("one bad row blocks the whole file", [r.body.ok, r.body.committed], [false, false]);
  eq("  writes nothing", stub.inserts, []);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: GOOD, commit: true });
  eq("a good file commits", [r.body.ok, r.body.committed, r.body.row_count], [true, true, 2]);
  eq("  in a single statement", productStatements(), 1);
  eq("  with every row", insertedProducts().length, 2);
  eq("  scoped to the caller's own vendor",
    insertedProducts().map((p) => (p as { vendor_id: string }).vendor_id), ["vendor-1", "vendor-1"]);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: GOOD, commit: true, submit_for_approval: true });
  eq("approved vendor can submit on upload", r.body.status, "pending_approval");
  eq("  every row carries that status",
    insertedProducts().map((p) => (p as { product_status: string }).product_status),
    ["pending_approval", "pending_approval"]);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR, insertError: "duplicate key" });
  const r = await call({ csv: GOOD, commit: true });
  eq("a failed insert is reported as a failure", [r.status, r.body.error], [500, "insert_failed"]);
}

section("audit");
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  await call({ csv: GOOD, commit: true });
  const audit = stub.inserts.filter((i) => i.table === "audit_logs");
  eq("one audit statement, not one per product", audit.length, 1);
  eq("  with an entry per product", audit[0].rows.length, 2);
  eq("  recording the actor", (audit[0].rows[0] as { actor_user_id: string }).actor_user_id, "u1");
  eq("  marked as a bulk import",
    (audit[0].rows[0] as { new_value: { source: string } }).new_value.source, "bulk_csv");
}

section("bad requests");
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const res = await POST(new Request("http://localhost/x", { method: "POST", body: "not json" }));
  eq("unparseable body", res.status, 400);
  eq("  writes nothing", stub.inserts, []);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: "" });
  eq("empty csv", r.status, 400);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const r = await call({ csv: "x".repeat(1_000_001) });
  eq("oversized csv", r.status, 400);
  eq("  writes nothing", stub.inserts, []);
}

section("template download");
{
  resetStub({ user: null, vendor: VENDOR });
  eq("needs a session", (await GET()).status, 401);
}
{
  resetStub({ user: { id: "u1" }, vendor: VENDOR });
  const res = await GET();
  const text = await res.text();
  eq("served as a csv attachment", [
    res.headers.get("content-type"),
    (res.headers.get("content-disposition") ?? "").includes(".csv"),
  ], ["text/csv; charset=utf-8", true]);
  // The template must be a file the importer accepts; if these two ever
  // disagree, every vendor's first upload fails.
  eq("the template is itself valid", text.split("\r\n")[0].startsWith("name,category,karat,weight_grams"), true);
}

report();

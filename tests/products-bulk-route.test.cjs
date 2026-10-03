// Checks for the bulk upload route in src/app/api/vendor/products/bulk.
//
// These run the real handler against a recording Supabase stub, because the
// things worth asserting are not about the response shape but about what
// reached the database: that an unauthorised caller writes nothing, that a dry
// run writes nothing, that a file with any bad row writes nothing, and that a
// good file is written in a single statement so a failure part-way cannot
// leave a vendor with half a catalogue.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

/**
 * Stands in for src/lib/supabase/server.ts and records every write it is asked
 * to make. Only a recording stub can answer "did a dry run write anything".
 */
function createSupabaseStub({ user = null, vendor = null, insertError = null } = {}) {
  const state = { user, vendor, insertError, inserts: [] };

  const table = (name) => {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: name === 'vendors' ? state.vendor : null, error: null }),
      single: async () => ({ data: name === 'vendors' ? state.vendor : null, error: null }),
      insert: (rows) => {
        const list = Array.isArray(rows) ? rows : [rows];
        state.inserts.push({ table: name, rows: list });
        const failed = name === 'products' && state.insertError !== null;
        const result = {
          data: failed ? null : list.map((r, i) => ({ id: `${name}-id-${i + 1}`, name: r.name ?? '' })),
          error: failed ? { message: state.insertError } : null,
        };
        // Awaited directly in some paths, chained through .select() in others.
        return Object.assign(Promise.resolve(result), { select: async () => result });
      },
    };
    return api;
  };

  const client = {
    from: (name) => table(name),
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  };

  return {
    state,
    module: {
      getServerSupabase: async () => client,
      getServiceSupabase: () => client,
    },
  };
}

const HEADER = 'name,category,karat,weight_grams';
const GOOD = `${HEADER}\nRing A,ring,22,1.5\nRing B,bangle,18,10`;
const BAD = `${HEADER}\nRing A,ring,22,1.5\nRing B,bangle,99,10`;
const VENDOR = { id: 'vendor-1', verification_status: 'approved' };
const UNAPPROVED = { id: 'vendor-1', verification_status: 'pending' };

/** Loads the route with the stub in place of the Supabase module. */
function loadRoute(stubOptions) {
  const stub = createSupabaseStub(stubOptions);
  const route = createLoader({ '@/lib/supabase/server': stub.module })(
    'src/app/api/vendor/products/bulk/route.ts',
  );
  return { route, state: stub.state };
}

function request(body) {
  return new Request('http://localhost/api/vendor/products/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function post(stubOptions, body) {
  const { route, state } = loadRoute(stubOptions);
  const response = await route.POST(request(body));
  return { status: response.status, body: await response.json(), state };
}

const productsInserted = (state) =>
  state.inserts.filter((i) => i.table === 'products').flatMap((i) => i.rows);
const productStatements = (state) => state.inserts.filter((i) => i.table === 'products').length;

test('refuses a caller with no session and writes nothing', async () => {
  const r = await post({ user: null, vendor: VENDOR }, { csv: GOOD, commit: true });
  assert.equal(r.status, 401);
  assert.deepEqual(r.state.inserts, []);
});

test('refuses a user with no vendor and writes nothing', async () => {
  const r = await post({ user: { id: 'u1' }, vendor: null }, { csv: GOOD, commit: true });
  assert.equal(r.status, 403);
  assert.deepEqual(r.state.inserts, []);
});

test('an unapproved vendor can still build up drafts', async () => {
  // That is the whole point of the draft state; blocking it would leave them
  // nothing to do while waiting for verification.
  const r = await post({ user: { id: 'u1' }, vendor: UNAPPROVED }, { csv: GOOD, commit: true });
  assert.equal(r.status, 200);
  assert.equal(productsInserted(r.state)[0].product_status, 'draft');
});

test('a dry run reports what would happen and writes nothing', async () => {
  const r = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: GOOD });
  assert.deepEqual([r.body.ok, r.body.committed, r.body.row_count], [true, false, 2]);
  assert.deepEqual(r.state.inserts, []);
  assert.deepEqual(r.body.preview.map((p) => p.line), [2, 3]);
});

test('a bad file is reported rather than thrown, and writes nothing', async () => {
  const r = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: BAD });
  assert.deepEqual([r.status, r.body.ok], [200, false]);
  assert.deepEqual([r.body.issues[0].line, r.body.issues[0].column], [3, 'karat']);
  assert.deepEqual(r.state.inserts, []);
});

test('one bad row blocks the whole file', async () => {
  const r = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: BAD, commit: true });
  assert.deepEqual([r.body.ok, r.body.committed], [false, false]);
  assert.deepEqual(r.state.inserts, []);
});

test('a good file commits in a single statement, scoped to the caller', async () => {
  const r = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: GOOD, commit: true });
  assert.deepEqual([r.body.ok, r.body.committed, r.body.row_count], [true, true, 2]);
  assert.equal(productStatements(r.state), 1);
  assert.equal(productsInserted(r.state).length, 2);
  assert.deepEqual(productsInserted(r.state).map((p) => p.vendor_id), ['vendor-1', 'vendor-1']);
});

test('an import only ever creates drafts', async () => {
  // A CSV carries no photograph, and the check_product_integrity trigger on
  // products raises on a pending_approval row that fails the integrity gate.
  // In a single-statement insert that would abort the whole upload, not just
  // one row — so there is no way to ask for approval here, and a caller that
  // tries anyway still gets drafts.
  const r = await post(
    { user: { id: 'u1' }, vendor: VENDOR },
    { csv: GOOD, commit: true, submit_for_approval: true },
  );
  assert.equal(r.body.status, 'draft');
  assert.deepEqual(productsInserted(r.state).map((p) => p.product_status), ['draft', 'draft']);
  assert.ok(productsInserted(r.state).every((p) => typeof p.inventory_confirmed_at === 'string'));
});

test('a failed insert is reported as a failure', async () => {
  const r = await post(
    { user: { id: 'u1' }, vendor: VENDOR, insertError: 'duplicate key' },
    { csv: GOOD, commit: true },
  );
  assert.deepEqual([r.status, r.body.error], [500, 'insert_failed']);
});

test('audits every product in one statement, not one per product', async () => {
  const r = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: GOOD, commit: true });
  const audit = r.state.inserts.filter((i) => i.table === 'audit_logs');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].rows.length, 2);
  assert.equal(audit[0].rows[0].actor_user_id, 'u1');
  assert.equal(audit[0].rows[0].new_value.source, 'bulk_csv');
});

test('refuses a malformed or oversized request and writes nothing', async () => {
  const { route, state } = loadRoute({ user: { id: 'u1' }, vendor: VENDOR });
  const unparseable = await route.POST(
    new Request('http://localhost/x', { method: 'POST', body: 'not json' }),
  );
  assert.equal(unparseable.status, 400);

  const empty = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: '' });
  assert.equal(empty.status, 400);

  const oversized = await post({ user: { id: 'u1' }, vendor: VENDOR }, { csv: 'x'.repeat(1_000_001) });
  assert.equal(oversized.status, 400);
  assert.deepEqual(oversized.state.inserts, []);
  assert.deepEqual(state.inserts, []);
});

test('the template download needs a session and is served as a csv', async () => {
  const anonymous = loadRoute({ user: null, vendor: VENDOR });
  assert.equal((await anonymous.route.GET()).status, 401);

  const signedIn = loadRoute({ user: { id: 'u1' }, vendor: VENDOR });
  const response = await signedIn.route.GET();
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.ok((response.headers.get('content-disposition') ?? '').includes('.csv'));
  const text = await response.text();
  assert.ok(text.split('\r\n')[0].startsWith('name,category,karat,weight_grams'));
});

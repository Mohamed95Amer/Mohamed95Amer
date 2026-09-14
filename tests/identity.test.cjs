const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createLoader } = require('./load-ts.cjs');
const load = createLoader();
const didit = load('src/lib/identity/didit.ts');
let savedEnv;
let savedFetch;

beforeEach(() => {
  savedEnv = { ...process.env };
  savedFetch = global.fetch;
  Object.assign(process.env, {
    DIDIT_API_KEY: 'synthetic-test-key-not-a-credential',
    DIDIT_WEBHOOK_SECRET: 'synthetic-webhook-secret',
    DIDIT_API_URL: 'https://verification.didit.me',
    DIDIT_ENVIRONMENT: 'sandbox',
    DIDIT_RESIDENT_WORKFLOW_ID: 'resident-workflow',
    DIDIT_VISITOR_WORKFLOW_ID: 'visitor-workflow',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
});
afterEach(() => {
  for (const name of Object.keys(process.env)) if (!(name in savedEnv)) delete process.env[name];
  Object.assign(process.env, savedEnv);
  global.fetch = savedFetch;
});

test('sandbox requires both a local app and local database', () => {
  assert.equal(didit.diditIsConfigured(), true);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co';
  assert.equal(didit.diditIsConfigured(), false);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://getgold.example';
  assert.equal(didit.diditIsConfigured(), false);
});
test('sandbox cannot run on a Vercel production or preview deployment', () => {
  process.env.VERCEL_ENV = 'production';
  assert.equal(didit.diditIsConfigured(), false);
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL = '1';
  assert.equal(didit.diditIsConfigured(), false);
});
test('environment must be explicit and provider evidence must match', () => {
  assert.equal(didit.diditEnvironmentMatches('sandbox'), true);
  for (const value of ['live', undefined, null, '', 'SANDBOX']) assert.equal(didit.diditEnvironmentMatches(value), false);
  process.env.DIDIT_ENVIRONMENT = 'live';
  assert.equal(didit.diditEnvironmentMatches('sandbox'), false);
  assert.equal(didit.diditEnvironmentMatches('live'), true);
  delete process.env.DIDIT_ENVIRONMENT;
  assert.equal(didit.diditIsConfigured(), false);
});
test('invalid endpoints, absent key and shared workflow IDs fail closed', () => {
  process.env.DIDIT_API_URL = 'https://attacker.example';
  assert.equal(didit.diditIsConfigured(), false);
  process.env.DIDIT_API_URL = 'https://verification.didit.me';
  process.env.DIDIT_VISITOR_WORKFLOW_ID = 'resident-workflow';
  assert.equal(didit.diditIsConfigured(), false);
  process.env.DIDIT_VISITOR_WORKFLOW_ID = 'visitor-workflow';
  process.env.DIDIT_API_KEY = '';
  assert.equal(didit.diditIsConfigured(), false);
});
test('all provider status classes map safely; unknown values never approve', () => {
  for (const [input, expected] of Object.entries({ Approved: 'approved', Declined: 'rejected', 'In Review': 'in_review', 'KYC Expired': 'expired', Abandoned: 'expired', Resubmitted: 'pending', 'In Progress': 'pending', 'AWAITING_USER': 'pending', Surprise: 'error' })) {
    assert.equal(didit.mapDiditStatus(input).status, expected);
  }
  assert.equal(didit.mapDiditStatus(undefined).status, 'pending');
});
test('webhook signatures accept authentic bodies and reject stale, forged and empty-secret cases', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const parsedBody = { environment: 'sandbox', status: 'Approved', timestamp: Number(timestamp) };
  const rawBody = JSON.stringify(parsedBody);
  const digest = createHmac('sha256', process.env.DIDIT_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const args = { rawBody, parsedBody, timestamp, signatureV2: '', rawSignature: digest };
  assert.equal(didit.verifyDiditWebhookSignature(args), true);
  assert.equal(didit.verifyDiditWebhookSignature({ ...args, rawSignature: '', signatureV2: digest }), true);
  assert.equal(didit.verifyDiditWebhookSignature({ ...args, timestamp: String(Number(timestamp) - 301) }), false);
  assert.equal(didit.verifyDiditWebhookSignature({ ...args, rawBody: rawBody.replace('Approved', 'Declined') }), false);
  assert.equal(didit.verifyDiditWebhookSignature({ ...args, rawSignature: 'not-hex' }), false);
  process.env.DIDIT_WEBHOOK_SECRET = '';
  assert.equal(didit.verifyDiditWebhookSignature(args), false);
});
test('decision reconciliation rejects sandbox results in live mode and missing environment', async () => {
  process.env.DIDIT_ENVIRONMENT = 'live';
  for (const environment of ['sandbox', undefined]) {
    global.fetch = async () => Response.json({ session_id: 'test', status: 'Approved', environment });
    await assert.rejects(didit.retrieveDiditDecision('test'), /unexpected environment/);
  }
  global.fetch = async () => Response.json({ session_id: 'test', status: 'Approved', environment: 'live' });
  assert.equal((await didit.retrieveDiditDecision('test')).status, 'Approved');
});
test('session creation binds route, product and order; uses no-store, timeout and no redirects', async () => {
  for (const route of ['uae_resident', 'visitor']) {
    global.fetch = async (url, options) => {
      if (options.method === 'GET') {
        assert.equal(url, 'https://verification.didit.me/v3/session/test/decision/');
        return Response.json({ session_id: 'test', environment: 'sandbox', vendor_data: 'getgold-order-check-1', workflow_id: route === 'uae_resident' ? 'resident-workflow' : 'visitor-workflow' });
      }
      assert.equal(url, 'https://verification.didit.me/v3/session/');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      const body = JSON.parse(options.body);
      assert.equal(body.vendor_data, 'getgold-order-check-1');
      assert.equal(body.workflow_id, route === 'uae_resident' ? 'resident-workflow' : 'visitor-workflow');
      assert.equal(body.callback, 'http://localhost:3000/products/item-1');
      assert.deepEqual(body.expected_details.expected_document_types, route === 'uae_resident' ? ['ID'] : ['P']);
      return Response.json({ session_id: 'test', url: 'https://verify.didit.me/session/test' });
    };
    assert.equal((await didit.createDiditVerificationSession({ verificationId: 'check-1', productId: 'item-1', route })).sessionId, 'test');
  }
});
test('session URLs with an unexpected host, port or embedded credentials are rejected', async () => {
  for (const url of ['http://verify.didit.me/test', 'https://evil.example/test', 'https://verify.didit.me:444/test', 'https://user:password@verify.didit.me/test']) {
    global.fetch = async () => Response.json({ session_id: 'test', url });
    await assert.rejects(didit.createDiditVerificationSession({ verificationId: 'check', productId: 'item', route: 'visitor' }), /unexpected verification URL/);
  }
});
test('wrong-mode API key cannot hand out a hosted document capture URL', async () => {
  process.env.DIDIT_ENVIRONMENT = 'live';
  global.fetch = async (_url, options) => options.method === 'POST'
    ? Response.json({ session_id: 'test', url: 'https://verify.didit.me/session/test' })
    : Response.json({ session_id: 'test', environment: 'sandbox', status: 'Approved' });
  await assert.rejects(didit.createDiditVerificationSession({ verificationId: 'check', productId: 'item', route: 'visitor' }), /unexpected environment/);
});

function webhookRequest(payload, signatureOverride) {
  const body = JSON.stringify(payload);
  const digest = createHmac('sha256', process.env.DIDIT_WEBHOOK_SECRET).update(body).digest('hex');
  return new Request('http://localhost/api/webhooks/didit', { method: 'POST', body, headers: {
    'x-timestamp': String(payload?.timestamp ?? ''), 'x-signature': signatureOverride ?? digest,
  } });
}
function webhookBase() {
  return { timestamp: Math.floor(Date.now() / 1000), environment: 'sandbox', webhook_type: 'status.updated', session_id: 'test', status: 'Approved', workflow_id: 'resident-workflow', vendor_data: 'order-ref' };
}
test('webhook rejects invalid JSON shapes, mismatched environment and forged signatures before database access', async () => {
  const { POST } = createLoader({ '@/lib/supabase/server': { getServiceSupabase: () => { throw new Error('Database must not be accessed'); } } })('src/app/api/webhooks/didit/route.ts');
  for (const body of [null, [], 'text', { status: 3 }, { ...webhookBase(), environment: undefined }]) {
    assert.equal((await POST(webhookRequest(body))).status, 400);
  }
  assert.equal((await POST(webhookRequest({ ...webhookBase(), environment: 'live' }))).status, 400);
  assert.equal((await POST(webhookRequest(webhookBase(), '0'.repeat(64)))).status, 401);
});
test('webhook retries database failures instead of falsely acknowledging delivery', async () => {
  const database = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: { message: 'offline' } }) }) };
  const { POST } = createLoader({ '@/lib/supabase/server': { getServiceSupabase: () => database } })('src/app/api/webhooks/didit/route.ts');
  assert.equal((await POST(webhookRequest(webhookBase()))).status, 503);
});
test('signed provider results persist for both routes without overwriting consumed or expired checks', async () => {
  for (const route of ['uae_resident', 'visitor']) {
    for (const [status, expected] of [['Approved', 'approved'], ['Declined', 'rejected'], ['In Review', 'in_review'], ['Expired', 'expired']]) {
      const writes = [];
      const conditions = [];
      const database = { from: () => ({
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { id: 'local-check', provider_external_user_id: 'order-ref', verification_route: route, status: 'pending' }, error: null }),
        update(value) { writes.push(value); return this; },
        neq(name, value) { conditions.push([name, value]); return this; },
        gt(name, value) { conditions.push([name, value]); return this; },
        then(resolve) { resolve({ error: null }); },
      }) };
      const { POST } = createLoader({ '@/lib/supabase/server': { getServiceSupabase: () => database } })('src/app/api/webhooks/didit/route.ts');
      const request = webhookRequest({ ...webhookBase(), workflow_id: route === 'visitor' ? 'visitor-workflow' : 'resident-workflow', status });
      assert.equal((await POST(request)).status, 204);
      assert.equal(writes[0].status, expected);
      assert.equal(Boolean(writes[0].verified_at), expected === 'approved');
      assert.deepEqual(conditions[0], ['status', 'consumed']);
      assert.equal(conditions[1][0], 'expires_at');
    }
  }
});
test('webhook write errors remain retryable', async () => {
  const database = { from: () => ({
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: { id: 'local-check', provider_external_user_id: 'order-ref', verification_route: 'uae_resident', status: 'pending' }, error: null }),
    update() { return this; }, neq() { return this; }, gt() { return this; },
    then(resolve) { resolve({ error: { message: 'offline' } }); },
  }) };
  const { POST } = createLoader({ '@/lib/supabase/server': { getServiceSupabase: () => database } })('src/app/api/webhooks/didit/route.ts');
  assert.equal((await POST(webhookRequest(webhookBase()))).status, 503);
});
test('polling never reports approval when a concurrent write made its update affect zero rows', async () => {
  const database = { from: () => {
    let updating = false;
    return {
      select() { return this; }, eq() { return this; }, in() { return this; }, gt() { return this; },
      update() { updating = true; return this; },
      maybeSingle: async () => updating ? { data: null, error: null } : { data: {
        status: 'pending', expires_at: '2099-01-01T00:00:00Z', provider: 'didit',
        provider_external_user_id: 'order-ref', provider_applicant_id: 'provider-session', verification_route: 'uae_resident',
      }, error: null },
    };
  } };
  const { GET } = createLoader({
    '@/lib/supabase/server': { getServiceSupabase: () => database, getServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'customer' } } }) } }) },
    '@/lib/identity/didit': { ...didit, retrieveDiditDecision: async () => ({ session_id: 'provider-session', vendor_data: 'order-ref', workflow_id: 'resident-workflow', status: 'Approved', environment: 'sandbox' }) },
  })('src/app/api/identity-verifications/status/route.ts');
  const response = await GET(new Request('http://localhost/api/identity-verifications/status?id=11111111-1111-4111-8111-111111111111'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'pending');
});

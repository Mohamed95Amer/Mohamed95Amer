const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const load = createLoader({
  '@/lib/supabase/server': {
    getServerSupabase: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
  },
});
const { GET } = load('src/app/auth/callback/route.ts');

test('email callbacks cannot redirect a signed-in customer to another origin', async () => {
  for (const next of ['https://example.invalid', '//example.invalid', '/\\example.invalid', '/\n/example.invalid', 'javascript:alert(1)']) {
    const request = new URL('https://getgold.ae/auth/callback?code=synthetic');
    request.searchParams.set('next', next);
    const response = await GET(new Request(request));
    assert.equal(response.headers.get('location'), 'https://getgold.ae/account', next);
  }
});

test('email callbacks preserve customer, vendor, delivery and password recovery destinations', async () => {
  for (const next of ['/account', '/vendor/register', '/delivery/register', '/reset-password', '/marketplace?category=bar']) {
    const request = new URL('https://getgold.ae/auth/callback?code=synthetic');
    request.searchParams.set('next', next);
    const response = await GET(new Request(request));
    assert.equal(response.headers.get('location'), `https://getgold.ae${next}`);
  }
});

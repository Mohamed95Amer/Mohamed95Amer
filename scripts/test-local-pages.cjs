// Run against `npm run dev:local`. Uses real HTTP, SSR cookies and PostgREST.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { localRuntime } = require('./local-runtime.cjs');

(async () => {
  const config = localRuntime();
  const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const must = result => { assert.equal(result.error, null, result.error?.message); return result.data; };
  const base = 'http://localhost:3000';
  let count = 0, vendorId, productId, reservationId;
  const userIds = [], roles = {};
  async function page(path, cookie = '', expected = 200) {
    const response = await fetch(base + path, { redirect: 'manual', headers: { cookie }, signal: AbortSignal.timeout(60000) });
    // App Router can encode redirect/not-found in a streamed 200 response after
    // sending the shared shell. Validate the control marker, not just status.
    if (response.status === 200 && expected === 307) {
      const html = await response.clone().text();
      assert.match(html, /NEXT_REDIRECT/, `${path}: expected a streamed redirect`);
    } else if (response.status === 200 && expected === 404) {
      assert.match(await response.clone().text(), /NEXT_HTTP_ERROR_FALLBACK;404/);
    } else {
      assert.equal(response.status, expected, `${path}: expected ${expected}, got ${response.status}`);
      if (expected === 200) {
        const html = await response.clone().text();
        assert.doesNotMatch(html, /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK;404|data-dgst="[^"]+"/, `${path}: unexpected streamed failure`);
      }
    }
    console.log(`PASS HTTP ${expected} ${path}`); count++;
    return response;
  }
  try {
    for (const path of ['/', '/marketplace', '/vendors', '/live-price', '/login', '/register', '/forgot-password', '/contact', '/how-it-works', '/trust', '/terms', '/privacy', '/delivery-and-collection', '/cancellations-and-refunds', '/compare']) await page(path);
    for (const path of ['/account', '/vendor', '/admin', '/delivery', '/profile']) await page(path, '', 307);
    for (const role of ['customer', 'vendor', 'delivery_company', 'admin']) {
      const email = `getgold-http-${role}-${randomUUID()}@example.invalid`, password = `Test-${randomUUID()}!`;
      const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, full_name: 'Synthetic browser tester' } })).user;
      userIds.push(user.id);
      if (role === 'admin') must(await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id));
      const jar = new Map();
      const client = createServerClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)) },
      });
      must(await client.auth.signInWithPassword({ email, password }));
      roles[role] = { ...user, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') };
    }
    for (const [role, paths] of Object.entries({
      customer: ['/account', '/account/saved', '/account/notifications', '/account/preferences', '/account/referrals', '/account/requests', '/account/visits', '/profile'],
      vendor: ['/vendor/register', '/profile'], delivery_company: ['/delivery/register', '/profile'],
      admin: ['/admin', '/admin/growth', '/admin/liquidity', '/admin/marketing', '/admin/vendors', '/admin/products', '/admin/orders', '/admin/reviews', '/admin/settings', '/admin/delivery-companies', '/admin/catalogue-support'],
    })) for (const path of paths) await page(path, roles[role].cookie);
    await page('/admin', roles.customer.cookie, 307);
    await page('/admin', roles.vendor.cookie, 307);
    vendorId = must(await admin.from('vendors').insert({ owner_user_id: roles.vendor.id, business_name: 'Synthetic HTTP store',
      trade_license_number: `TEST-${randomUUID()}`, license_expiry_date: '2099-01-01', owner_name: 'Test owner',
      email: roles.vendor.email, phone: '+971500000000', emirate: 'Dubai', store_address: 'Test fixture only', verification_status: 'approved',
    }).select('id').single()).id;
    productId = must(await admin.from('products').insert({ vendor_id: vendorId, name: 'Synthetic 22K Bangle',
      description: 'Synthetic browser fixture, not real stock.', category: 'bangle', karat: 22, weight_grams: 10,
      quantity: 3, images: ['test-only/bangle.jpg'], hallmark_info: 'Test 22K hallmark', product_status: 'approved',
    }).select('id').single()).id;
    const visibleCount = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const before = await (await page(`/products/${productId}`)).text();
    assert.ok(/3\s*units available/.test(visibleCount(before)), 'Product must render 3 units available');
    const check = must(await admin.from('order_identity_verifications').insert({ user_id: roles.customer.id,
      product_id: productId, provider_external_user_id: `synthetic-${randomUUID()}`, provider: 'didit', verification_route: 'uae_resident',
      status: 'approved', verified_at: new Date().toISOString(), expires_at: new Date(Date.now() + 1800000).toISOString(),
    }).select('id').single());
    reservationId = must(await admin.rpc('claim_reservation', { p_customer_user_id: roles.customer.id, p_product_id: productId,
      p_quantity: 1, p_expires_at: new Date(Date.now() + 600000).toISOString(), p_identity_verification_id: check.id,
    }).single()).id;
    const after = await (await page(`/products/${productId}`)).text();
    assert.ok(/2\s*units available/.test(visibleCount(after)), 'Product must render 2 units available after claim');
    console.log('PASS rendered availability changed 3 -> 2 after real RPC claim');
    for (const path of ['/vendor', '/vendor/products', '/vendor/orders', '/vendor/requests', '/vendor/reviews', '/vendor/catalogue-support']) await page(path, roles.vendor.cookie);
    await page(`/account/reservations/${reservationId}`, roles.customer.cookie);
    await page(`/account/reservations/${reservationId}`, roles.vendor.cookie, 404);
    console.log(`PASS ${count} HTTP route checks and rendered stock change`);
  } finally {
    if (reservationId) must(await admin.from('reservations').delete().eq('id', reservationId));
    for (const id of userIds) must(await admin.from('order_identity_verifications').delete().eq('user_id', id));
    if (productId) must(await admin.from('products').delete().eq('id', productId));
    if (vendorId) must(await admin.from('vendors').delete().eq('id', vendorId));
    for (const id of userIds) must(await admin.auth.admin.deleteUser(id));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

// Actual Auth + PostgREST + route handlers. Didit decisions are synthetic fixtures,
// NOT provider verification. This suite refuses any non-local database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { localRuntime } = require('../../scripts/local-runtime.cjs');
const { createLoader } = require('../load-ts.cjs');

test('isolated marketplace integration', { timeout: 120000 }, async t => {
  Object.assign(process.env, localRuntime(), {
    DIDIT_API_KEY: 'test-only-never-sent-to-provider',
    DIDIT_RESIDENT_WORKFLOW_ID: randomUUID(), DIDIT_VISITOR_WORKFLOW_ID: randomUUID(),
    RATE_LIMIT_RESERVATIONS_PER_MIN: '100',
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(url, 'http://127.0.0.1:54321');
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
  const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions);
  const users = [], products = [], reservations = [], ticks = [];
  let vendorId, companyId, onboardingVendorId;
  const fixtures = {};
  const must = result => { assert.equal(result.error, null, result.error?.message); return result.data; };
  const previousSettings = must(await admin.from('platform_settings').select('*').eq('id', true).single());
  let activeClient = anon();
  const load = createLoader({ '@/lib/supabase/server': { getServerSupabase: async () => activeClient, getServiceSupabase: () => admin } });
  async function route(file, payload, method = 'POST') {
    const response = await load(`src/app/api/${file}/route.ts`)[method](new Request(`http://localhost:3000/api/${file}`, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    }));
    return { status: response.status, body: await response.json() };
  }
  async function formRoute(file, formData, method = 'POST') {
    const response = await load(`src/app/api/${file}/route.ts`)[method](new Request(`http://localhost:3000/api/${file}`, { method, body: formData }));
    return { status: response.status, body: await response.json() };
  }
  async function identity(user, product, status = 'approved') {
    return must(await admin.from('order_identity_verifications').insert({
      user_id: user.id, product_id: product.id, verification_route: 'uae_resident', provider: 'didit',
      provider_external_user_id: `synthetic-${randomUUID()}`, status,
      verified_at: status === 'approved' ? new Date().toISOString() : null,
      expires_at: new Date(Date.now() + 1800000).toISOString(),
    }).select().single());
  }
  const claimArgs = (user, product, check) => ({ p_customer_user_id: user.id, p_product_id: product.id,
    p_quantity: 1, p_expires_at: new Date(Date.now() + 600000).toISOString(), p_identity_verification_id: check.id });
  try {
    for (const role of ['customer', 'vendor', 'delivery_company', 'outsider', 'admin_test']) {
      const email = `getgold-${role}-${randomUUID()}@example.invalid`;
      const password = `Test-${randomUUID()}!`;
      const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
        user_metadata: { role: role === 'outsider' ? 'super_admin' : role, full_name: 'Synthetic tester' } })).user;
      users.push(user.id);
      const client = anon(); must(await client.auth.signInWithPassword({ email, password }));
      fixtures[role] = { ...user, client };
    }
    must(await admin.from('profiles').update({ role: 'admin' }).eq('id', fixtures.admin_test.id));
    const vendor = must(await admin.from('vendors').insert({ owner_user_id: fixtures.vendor.id,
      business_name: 'Synthetic integration store', trade_license_number: `TEST-${randomUUID()}`,
      license_expiry_date: '2099-01-01', owner_name: 'Synthetic owner', email: fixtures.vendor.email,
      phone: '+971500000000', emirate: 'Dubai', store_address: 'Test fixture only', verification_status: 'approved',
    }).select().single());
    vendorId = vendor.id;
    await t.test('New vendor can submit onboarding, revise it, and stays pending for review', async () => {
      const email = `getgold-onboarding-${randomUUID()}@example.invalid`;
      const password = `Test-${randomUUID()}!`;
      const onboardingUser = must(await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { role: 'customer', full_name: 'Synthetic new vendor' },
      })).user;
      users.push(onboardingUser.id);
      const onboardingClient = anon();
      must(await onboardingClient.auth.signInWithPassword({ email, password }));
      activeClient = onboardingClient;
      const payload = {
        business_name: 'Synthetic New Souq Jewellers',
        trade_license_number: `TEST-ONBOARD-${randomUUID()}`,
        license_expiry_date: '2099-01-01',
        owner_name: 'Synthetic new vendor owner',
        email,
        phone: '+971500000002',
        emirate: 'Dubai',
        store_address: 'Gold Souq, Deira, Dubai',
        google_maps_link: null,
        vat_trn_number: null,
      };
      const created = await route('vendor/onboard', payload);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      onboardingVendorId = created.body.vendorId;
      const pending = must(await admin.from('vendors').select('owner_user_id,business_name,verification_status').eq('id', onboardingVendorId).single());
      assert.equal(pending.owner_user_id, onboardingUser.id);
      assert.equal(pending.business_name, payload.business_name);
      assert.equal(pending.verification_status, 'pending');
      assert.equal(must(await admin.from('profiles').select('role').eq('id', onboardingUser.id).single()).role, 'vendor');

      const invalid = await route('vendor/onboard', { ...payload, trade_license_number: 'x' });
      assert.equal(invalid.status, 400, JSON.stringify(invalid.body));
      const revised = await route('vendor/onboard', { ...payload, business_name: 'Synthetic New Souq Jewellers Revised' });
      assert.equal(revised.status, 200, JSON.stringify(revised.body));
      assert.equal(revised.body.vendorId, onboardingVendorId);
      assert.equal(must(await admin.from('vendors').select('business_name,verification_status').eq('id', onboardingVendorId).single()).verification_status, 'pending');

      activeClient = anon();
      assert.equal((await route('vendor/onboard', payload)).status, 401);
      activeClient = fixtures.vendor.client;
    });
    const company = must(await admin.from('delivery_companies').insert({ owner_user_id: fixtures.delivery_company.id,
      company_name: 'Synthetic test courier', trade_license_number: `TEST-${randomUUID()}`,
      license_expiry_date: '2099-01-01', contact_name: 'Synthetic courier', email: fixtures.delivery_company.email,
      phone: '+971500000000', emirates_served: ['Dubai'], verification_status: 'approved',
    }).select().single());
    companyId = company.id;
    for (const quantity of [10, 1]) {
      products.push(must(await admin.from('products').insert({ vendor_id: vendor.id, name: 'Synthetic 22K Bangle',
        description: 'Synthetic integration fixture, never a real listing.', category: 'bangle', karat: 22,
        weight_grams: 10, quantity, making_charge: 100, vendor_premium: 150, images: ['test-only/bangle.jpg'],
        hallmark_info: 'Synthetic 22K hallmark', product_status: 'approved',
      }).select().single()));
    }
    must(await admin.from('platform_settings').update({ delivery_fee_aed: 20, platform_fee_bps: 100 }).eq('id', true));
    const tick = must(await admin.from('gold_price_ticks').insert({ source: 'manual', xau_usd: 4234.7,
      usd_aed: 3.6725, price_per_gram_24k_aed: 500, status: 'ok', fetched_at: new Date().toISOString(),
    }).select().single()); ticks.push(tick.id);

    await t.test('Vendor VAT survives create/edit round trips; tax changes require review and reject premium', async () => {
      activeClient = fixtures.vendor.client;
      const payload = { name: 'Synthetic 24K Gold Bar', description: 'Synthetic integration fixture only, not a real product.', category: 'bar', karat: 24,
        weight_grams: 10, making_charge: 0, making_charge_discount_percent: 0, making_charge_offer_ends_at: null,
        certificate_fee: 25, certificate_number: 'SYNTHETIC-ASSAY', stone_value: 0, quantity: 2, vat_rate_bps: 0, vat_choice_confirmed: true,
        images: ['test-only/bar.jpg'], hallmark_info: 'Synthetic 24K hallmark', submit_for_approval: false };
      const created = await route('vendor/products', payload);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const item = must(await admin.from('products').select('*').eq('id', created.body.id).single());
      products.push(item);
      assert.equal(item.vat_rate_bps, 0); assert.equal(item.vendor_premium, 0);
      must(await admin.from('products').update({ product_status: 'approved' }).eq('id', item.id));
      const official = await load('src/lib/pricing/server.ts').computeOfficialPriceForProduct(item.id, 2, 'collection');
      assert.equal(official.breakdown.vatRateBps, 0); assert.equal(official.breakdown.vatAed, 0);
      assert.equal(official.totalPriceAed, 10150.5);
      const changed = await route('vendor/products', { ...payload, id: item.id, vat_rate_bps: 500, submit_for_approval: true }, 'PUT');
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      const updated = must(await admin.from('products').select('*').eq('id', item.id).single());
      assert.equal(updated.vat_rate_bps, 500); assert.equal(updated.product_status, 'pending_approval');
      assert.equal((await route('vendor/products', { ...payload, id: item.id, vendor_premium: 25 }, 'PUT')).status, 400);
      assert.equal((await route('vendor/products', { ...payload, id: item.id, vat_choice_confirmed: false }, 'PUT')).status, 400);
      activeClient = fixtures.outsider.client;
      assert.equal((await route('vendor/products', { ...payload, id: item.id }, 'PUT')).status, 403);
      activeClient = fixtures.vendor.client;
      must(await admin.from('products').update({ product_status: 'suspended' }).eq('id', item.id));
      assert.equal((await route('vendor/products', { ...payload, id: item.id, submit_for_approval: true }, 'PUT')).status, 200);
      assert.equal(must(await admin.from('products').select('product_status').eq('id', item.id).single()).product_status, 'suspended');
    });
    await t.test('Auth roles cannot be self-promoted; private data is denied', async () => {
      assert.equal(must(await admin.from('profiles').select('role').eq('id', fixtures.outsider.id).single()).role, 'customer');
      const attack = await fixtures.customer.client.from('profiles').update({ role: 'super_admin' }).eq('id', fixtures.customer.id);
      assert.ok(attack.error);
      assert.ok((await fixtures.outsider.client.from('delivery_assignments').select('*')).error);
      assert.ok((await anon().from('notifications').select('*')).error);
    });
    await t.test('Profile API saves contact data and ignores role escalation', async () => {
      activeClient = fixtures.customer.client;
      const result = await route('profile', { full_name: 'Synthetic buyer', phone: '+971500000000', role: 'admin' }, 'PATCH');
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const profile = must(await admin.from('profiles').select('role,full_name').eq('id', fixtures.customer.id).single());
      assert.equal(profile.role, 'customer'); assert.equal(profile.full_name, 'Synthetic buyer');
    });
    await t.test('Raw vendor and product records are private, including approved rows', async () => {
      for (const client of [anon(), fixtures.customer.client, fixtures.outsider.client]) {
        assert.deepEqual(must(await client.from('vendors').select('id,bank_account_details,admin_notes').eq('id', vendorId)), []);
        assert.deepEqual(must(await client.from('products').select('id,admin_notes').eq('id', products[0].id)), []);
      }
      assert.equal(must(await fixtures.vendor.client.from('vendors').select('id').eq('id', vendorId).single()).id, vendorId);
      assert.equal(must(await fixtures.admin_test.client.from('products').select('id').eq('id', products[0].id).single()).id, products[0].id);
      assert.equal(must(await anon().from('gold_price_ticks').select('id').eq('id', tick.id).single()).id, tick.id);
    });
    await t.test('Direct clients cannot self-approve vendors or products or edit internal fields', async () => {
      const attackVendorId = randomUUID(), attackProductId = randomUUID();
      try {
        const vendorAttack = await fixtures.outsider.client.from('vendors').insert({ ...vendor,
          id: attackVendorId, owner_user_id: fixtures.outsider.id, verification_status: 'approved' });
        assert.ok(vendorAttack.error, 'direct vendor creation must be denied');
        const productAttack = await fixtures.vendor.client.from('products').insert({
          id: attackProductId, vendor_id: vendorId, name: 'Synthetic 22K Bangle', category: 'bangle',
          karat: 22, weight_grams: 10, images: ['test-only/bangle.jpg'], hallmark_info: 'Synthetic 22K hallmark',
          product_status: 'approved' });
        assert.ok(productAttack.error, 'direct approved listing creation must be denied');
        assert.ok((await fixtures.vendor.client.from('products').update({ admin_notes: 'tampered' }).eq('id', products[0].id)).error);
        assert.ok((await fixtures.vendor.client.from('vendors').update({ verification_status: 'approved', admin_notes: 'tampered' }).eq('id', vendorId)).error);
      } finally {
        must(await admin.from('products').delete().eq('id', attackProductId));
        must(await admin.from('vendors').delete().eq('id', attackVendorId));
      }
    });
    await t.test('Vendor browser uploads still work and cannot cross store boundaries', async () => {
      const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1cAAAAASUVORK5CYII=', 'base64');
      for (const bucket of ['product-images', 'vendor-docs']) {
        const path = `${vendorId}/security-test/${randomUUID()}.png`;
        const deniedPath = `${vendorId}/security-test/${randomUUID()}.png`;
        try {
          must(await fixtures.vendor.client.storage.from(bucket).upload(path, image, { contentType: 'image/png' }));
          assert.ok((await fixtures.outsider.client.storage.from(bucket).upload(deniedPath, image, { contentType: 'image/png' })).error);
          if (bucket === 'vendor-docs') {
            must(await fixtures.vendor.client.storage.from(bucket).download(path));
            assert.ok((await fixtures.outsider.client.storage.from(bucket).download(path)).error);
          }
        } finally {
          must(await admin.storage.from(bucket).remove([path, deniedPath]));
        }
      }
    });
    await t.test('Admin can schedule and cancel premium placement, discounts and text banners', async () => {
      activeClient = fixtures.customer.client;
      assert.equal((await route('admin/vendor-promotions', { vendorId, durationDays: 5, label: 'Premium vendor', rewardReason: 'referral_reward' })).status, 401);
      assert.ok((await fixtures.customer.client.from('vendor_promotions').select('*')).error);
      activeClient = fixtures.vendor.client;
      assert.equal((await route('admin/vendor-promotions', { vendorId, durationDays: 5, label: 'Vendor self-promotion', rewardReason: 'referral_reward' })).status, 403);
      assert.equal((await formRoute('admin/banners', new FormData())).status, 403);

      activeClient = fixtures.admin_test.client;
      const premium = await route('admin/vendor-promotions', { vendorId, durationDays: 5, label: 'Premium vendor', rewardReason: 'referral_reward', adminNote: 'Synthetic test reward' });
      assert.equal(premium.status, 200, JSON.stringify(premium.body));
      assert.equal(must(await admin.from('vendor_promotions').select('vendor_id,reward_reason').eq('id', premium.body.promotion.id).single()).reward_reason, 'referral_reward');
      assert.equal((await route('admin/vendor-promotions', { vendorId, durationDays: 5, label: 'Premium vendor', rewardReason: 'referral_reward' })).status, 409);
      assert.equal((await route('admin/vendor-promotions', { id: premium.body.promotion.id }, 'DELETE')).status, 200);

      const campaign = await route('admin/marketplace-promotions', { title: 'Synthetic event', serviceFeeDiscountPercent: 50, deliveryDiscountPercent: 100, durationDays: 2 });
      assert.equal(campaign.status, 200, JSON.stringify(campaign.body));
      assert.equal(must(await admin.from('marketplace_promotions').select('delivery_discount_percent').eq('id', campaign.body.promotion.id).single()).delivery_discount_percent, 100);
      activeClient = fixtures.outsider.client;
      const promotionalCheck = await identity(fixtures.outsider, products[0]);
      const promotionalOrder = await route('reservations', { productId: products[0].id, quantity: 1, identityVerificationId: promotionalCheck.id,
        paymentMethod: 'pay_at_store', fulfilmentMethod: 'delivery', recipientName: 'Promotion tester',
        recipientPhone: '+971500000001', deliveryEmirate: 'Dubai', deliveryArea: 'Test area',
        deliveryAddressLine1: 'Test building', deliveryLatitude: 25.2, deliveryLongitude: 55.3 });
      assert.equal(promotionalOrder.status, 200, JSON.stringify(promotionalOrder.body));
      const promotionalSnapshot = must(await admin.from('order_price_snapshots').select('*').eq('reservation_id', promotionalOrder.body.reservation.id).single());
      assert.equal(promotionalSnapshot.platform_fee_bps, 25);
      assert.equal(promotionalSnapshot.service_fee_event_discount_percent, 50);
      assert.equal(promotionalSnapshot.delivery_fee_before_event_discount, 20);
      assert.equal(promotionalSnapshot.delivery_fee, 0);
      assert.equal(promotionalSnapshot.delivery_event_discount_percent, 100);
      assert.equal(promotionalSnapshot.marketplace_promotion_title, 'Synthetic event');
      assert.equal(promotionalSnapshot.total_price_aed, 4926.29);
      must(await admin.from('reservations').delete().eq('id', promotionalOrder.body.reservation.id));
      activeClient = fixtures.admin_test.client;
      assert.equal((await route('admin/marketplace-promotions', { id: campaign.body.promotion.id }, 'DELETE')).status, 200);

      const form = new FormData();
      for (const [key, value] of Object.entries({ title: 'Synthetic banner', body: 'Integration test only', placement: 'marketplace_top', durationDays: '2', displayOrder: '0' })) form.set(key, value);
      const banner = await formRoute('admin/banners', form);
      assert.equal(banner.status, 200, JSON.stringify(banner.body));
      assert.equal(must(await admin.from('site_banners').select('placement').eq('id', banner.body.banner.id).single()).placement, 'marketplace_top');
      assert.equal((await route('admin/banners', { id: banner.body.banner.id }, 'DELETE')).status, 200);
    });
    let order, cardOrder;
    await t.test('Fresh degraded quotes cannot authorize checkout', async () => {
      activeClient = fixtures.customer.client;
      must(await admin.from('gold_price_ticks').update({ status: 'degraded' }).eq('id', tick.id));
      try {
        const result = await route('reservations', { productId: products[0].id, quantity: 1,
          identityVerificationId: randomUUID(), paymentMethod: 'pay_at_store', fulfilmentMethod: 'collection' });
        assert.equal(result.status, 409, JSON.stringify(result.body));
        assert.equal(result.body.error, 'price_stale');
      } finally {
        must(await admin.from('gold_price_ticks').update({ status: 'ok' }).eq('id', tick.id));
      }
    });
    await t.test('Reservation handler calls real RPC, charges delivery once, and drops stock', async () => {
      activeClient = fixtures.customer.client;
      const check = await identity(fixtures.customer, products[0]);
      // ProductPage uses the server-only service client, not an RLS-filtered buyer client.
      assert.equal(must(await admin.rpc('available_quantity', { p_product_id: products[0].id })), 10);
      const result = await route('reservations', { productId: products[0].id, quantity: 3, identityVerificationId: check.id,
        paymentMethod: 'pay_at_store', fulfilmentMethod: 'delivery', recipientName: 'Synthetic buyer',
        recipientPhone: '+971500000000', deliveryEmirate: 'Dubai', deliveryArea: 'Test area',
        deliveryAddressLine1: 'Test building', deliveryLatitude: 25.2, deliveryLongitude: 55.3,
      });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      order = result.body.reservation; reservations.push(order.id);
      assert.equal(must(await admin.rpc('available_quantity', { p_product_id: products[0].id })), 7);
      const snapshot = must(await admin.from('order_price_snapshots').select('*').eq('reservation_id', order.id).single());
      assert.equal(snapshot.delivery_fee_basis, 'per_order'); assert.equal(snapshot.delivery_fee, 20);
      assert.equal(snapshot.total_price_aed, 14836.71);
      assert.equal(snapshot.platform_fee_bps, 50);
      assert.equal(snapshot.customer_fee_standard_bps, 100);
      assert.equal(snapshot.customer_fee_discount_percent, 50);
      assert.equal(snapshot.customer_fee_promo_order_number, 1);
      assert.equal(snapshot.vendor_commission_basis, 'paused');
      assert.equal(snapshot.vendor_commission_standard_aed, 0);
      assert.equal(snapshot.vendor_commission_aed, 0);
      assert.equal(must(await admin.from('order_identity_verifications').select('status').eq('id', check.id).single()).status, 'consumed');
      assert.ok((await admin.rpc('claim_reservation', claimArgs(fixtures.customer, products[0], check))).error);
    });
    await t.test('Direct customer and vendor clients cannot tamper with locked order state', async () => {
      assert.ok(order, 'reservation test must pass');
      const before = must(await admin.from('reservations').select('status,payment_status,quantity,identity_verification_id').eq('id', order.id).single());
      for (const client of [anon(), fixtures.customer.client, fixtures.vendor.client, fixtures.outsider.client]) {
        assert.ok((await client.from('reservations').update({ status: 'paid', payment_status: 'paid', quantity: 999 }).eq('id', order.id)).error);
        assert.ok((await client.from('order_price_snapshots').update({ total_price_aed: 0 }).eq('reservation_id', order.id)).error);
      }
      assert.deepEqual(must(await admin.from('reservations').select('status,payment_status,quantity,identity_verification_id').eq('id', order.id).single()), before);
    });
    await t.test('Two real concurrent stock claims cannot both reserve the last unit', async () => {
      const checks = await Promise.all([identity(fixtures.customer, products[1]), identity(fixtures.outsider, products[1])]);
      const results = await Promise.all([admin.rpc('claim_reservation', claimArgs(fixtures.customer, products[1], checks[0])).single(),
        admin.rpc('claim_reservation', claimArgs(fixtures.outsider, products[1], checks[1])).single()]);
      for (const result of results) if (result.data) reservations.push(result.data.id);
      assert.equal(results.filter(result => !result.error).length, 1);
      assert.match(results.find(result => result.error).error.message, /insufficient_stock/);
    });
    await t.test('Rejected identity and another customer identity never authorize stock', async () => {
      const check = await identity(fixtures.customer, products[0], 'rejected');
      assert.ok((await admin.rpc('claim_reservation', claimArgs(fixtures.customer, products[0], check))).error);
      const approved = await identity(fixtures.customer, products[0]);
      assert.ok((await admin.rpc('claim_reservation', claimArgs(fixtures.outsider, products[0], approved))).error);
    });
    await t.test('Vendor confirms payment; unrelated users cannot progress the order', async () => {
      assert.ok(order, 'reservation test must pass');
      activeClient = fixtures.outsider.client;
      assert.equal((await route('vendor/reservations/respond', { reservationId: order.id, decision: 'confirm' })).status, 403);
      activeClient = fixtures.vendor.client;
      const responses = await Promise.all([route('vendor/reservations/respond', { reservationId: order.id, decision: 'confirm' }), route('vendor/reservations/respond', { reservationId: order.id, decision: 'confirm' })]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
      must(await admin.from('reservations').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', order.id));
      assert.equal((await route('vendor/reservations/progress', { reservationId: order.id, action: 'confirm_payment_received' })).status, 409);
      must(await admin.from('reservations').update({ expires_at: new Date(Date.now() + 600000).toISOString() }).eq('id', order.id));
      const paid = await route('vendor/reservations/progress', { reservationId: order.id, action: 'confirm_payment_received' });
      assert.equal(paid.status, 200, JSON.stringify(paid.body));
      assert.equal(must(await admin.from('reservations').select('status').eq('id', order.id).single()).status, 'paid');
    });
    await t.test('Courier assignment, ownership denial, failed delivery, retry and proof persist', async () => {
      assert.ok(order, 'reservation test must pass');
      activeClient = fixtures.vendor.client;
      const assigned = await route('vendor/delivery-assignments', { reservationId: order.id, deliveryCompanyId: company.id });
      assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
      activeClient = fixtures.outsider.client;
      assert.equal((await route('delivery/assignments', { assignmentId: assigned.body.id, status: 'accepted' })).status, 403);
      activeClient = fixtures.delivery_company.client;
      for (const status of ['accepted', 'pickup_scheduled', 'collected', 'out_for_delivery', 'delivery_failed', 'out_for_delivery']) {
        const result = await route('delivery/assignments', { assignmentId: assigned.body.id, status });
        assert.equal(result.status, 200, JSON.stringify(result.body));
      }
      assert.equal((await route('delivery/assignments', { assignmentId: assigned.body.id, status: 'delivered' })).status, 400);
      const delivered = await route('delivery/assignments', { assignmentId: assigned.body.id, status: 'delivered', proofReference: 'SYNTHETIC-POD-001' });
      assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
      const saved = must(await admin.from('delivery_assignments').select('status,proof_reference,delivered_at').eq('id', assigned.body.id).single());
      assert.equal(saved.status, 'delivered'); assert.equal(saved.proof_reference, 'SYNTHETIC-POD-001'); assert.ok(saved.delivered_at);
    });
    await t.test('Bank transfer requires vendor opt-in, private proof, cleared-funds confirmation and a valid hold', async () => {
      activeClient = fixtures.customer.client;
      const payload = { productId: products[0].id, quantity: 1, identityVerificationId: (await identity(fixtures.customer, products[0])).id, paymentMethod: 'bank_transfer', fulfilmentMethod: 'collection' };
      assert.equal((await route('reservations', payload)).status, 409);
      assert.equal((await route('vendor/payment-settings', { bank_transfer_enabled: true, bank_name: 'Test Bank', beneficiary_name: 'Synthetic store', iban: 'AE070331234567890123456' })).status, 403);
      activeClient = fixtures.vendor.client;
      const setup = await route('vendor/payment-settings', { bank_transfer_enabled: true, bank_name: 'Test Bank', beneficiary_name: 'Synthetic store', iban: 'AE070331234567890123456' });
      assert.equal(setup.status, 200, JSON.stringify(setup.body));
      assert.ok((await fixtures.outsider.client.from('vendor_payment_settings').select('*')).error);
      activeClient = fixtures.customer.client;
      const created = await route('reservations', payload);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const id = created.body.reservation.id; reservations.push(id);
      const promotionalSnapshot = must(await admin.from('order_price_snapshots').select('*').eq('reservation_id', id).single());
      assert.equal(promotionalSnapshot.platform_fee_bps, 50);
      assert.equal(promotionalSnapshot.customer_fee_promo_order_number, 2);
      const submit = async () => {
        const form = new FormData(); form.set('reservationId', id); form.set('reference', 'SYNTHETIC-TRANSFER');
        form.set('proof', new File(['%PDF-1.4\nSynthetic proof only'], 'test.pdf', { type: 'application/pdf' }));
        return load('src/app/api/reservations/bank-proof/route.ts').POST(new Request('http://localhost:3000/api/reservations/bank-proof', { method: 'POST', body: form }));
      };
      assert.equal((await submit()).status, 409, 'cannot pay before store accepts stock');
      activeClient = fixtures.vendor.client;
      assert.equal((await route('vendor/reservations/respond', { reservationId: id, decision: 'confirm' })).status, 200);
      assert.equal((await route('vendor/reservations/progress', { reservationId: id, action: 'confirm_payment_received' })).status, 409, 'missing proof cannot be confirmed');
      activeClient = fixtures.outsider.client; assert.equal((await submit()).status, 404);
      activeClient = fixtures.customer.client; assert.equal((await submit()).status, 200);
      let row = must(await admin.from('reservations').select('*').eq('id', id).single());
      assert.equal(row.status, 'payment_pending'); assert.notEqual(row.payment_status, 'paid');
      assert.equal((await anon().storage.from('payment-proofs').download(row.transfer_proof_path)).data, null);
      activeClient = fixtures.outsider.client;
      assert.equal((await load('src/app/api/reservations/bank-proof/route.ts').GET(new Request(`http://localhost:3000/api/reservations/bank-proof?id=${id}`))).status, 404);
      activeClient = fixtures.vendor.client;
      assert.equal((await load('src/app/api/reservations/bank-proof/route.ts').GET(new Request(`http://localhost:3000/api/reservations/bank-proof?id=${id}`))).status, 307);
      must(await admin.from('reservations').update({ expires_at: new Date(Date.now()-1000).toISOString() }).eq('id', id));
      assert.equal((await route('vendor/reservations/progress', { reservationId: id, action: 'confirm_payment_received' })).status, 409);
      must(await admin.from('reservations').update({ expires_at: new Date(Date.now()+600000).toISOString() }).eq('id', id));
      assert.equal((await route('vendor/reservations/progress', { reservationId: id, action: 'confirm_payment_received' })).status, 200);
      assert.equal((await route('vendor/reservations/progress', { reservationId: id, action: 'confirm_payment_received' })).status, 409);
      row = must(await admin.from('reservations').select('*').eq('id', id).single()); assert.equal(row.status, 'paid'); assert.ok(row.payment_confirmed_at);
    });
    await t.test('Vendor-enabled cards and vendor delivery fees are enforced; pickup stays free', async () => {
      activeClient = fixtures.customer.client;
      const check = await identity(fixtures.customer, products[0]);
      const payload = { productId: products[0].id, quantity: 2, identityVerificationId: check.id, paymentMethod: 'card', fulfilmentMethod: 'collection' };
      assert.equal((await route('reservations', payload)).status, 409);
      activeClient = fixtures.vendor.client;
      assert.equal((await route('vendor/payment-settings', { bank_transfer_enabled: false, bank_name: '', beneficiary_name: '', iban: '', cash_enabled: true, card_enabled: true, delivery_mode: 'external_courier', courier_name: 'Synthetic courier', delivery_fee_aed: 35 })).status, 200);
      activeClient = fixtures.customer.client;
      const created = await route('reservations', payload); assert.equal(created.status, 200, JSON.stringify(created.body));
      reservations.push(created.body.reservation.id);
      cardOrder = created.body.reservation;
      const snapshot = must(await admin.from('order_price_snapshots').select('*').eq('reservation_id', created.body.reservation.id).single());
      assert.equal(snapshot.delivery_fee, 0); assert.equal(snapshot.total_price_aed, 9877.14);
      assert.equal(snapshot.platform_fee_bps, 50);
      assert.equal(snapshot.customer_fee_promo_order_number, 3);
      activeClient = fixtures.vendor.client;
      assert.equal((await route('vendor/reservations/respond', { reservationId: created.body.reservation.id, decision: 'confirm' })).status, 200);
      const order = must(await admin.from('reservations').select('*').eq('id', created.body.reservation.id).single());
      assert.ok(Date.parse(order.expires_at) - Date.now() > 23 * 3600000);
      assert.equal(order.status, 'payment_pending'); assert.notEqual(order.payment_status, 'paid');
    });
    await t.test('The fourth qualifying order uses the standard 1% customer fee', async () => {
      activeClient = fixtures.customer.client;
      const check = await identity(fixtures.customer, products[0]);
      const created = await route('reservations', { productId: products[0].id, quantity: 1,
        identityVerificationId: check.id, paymentMethod: 'cash', fulfilmentMethod: 'collection' });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      reservations.push(created.body.reservation.id);
      const snapshot = must(await admin.from('order_price_snapshots').select('*').eq('reservation_id', created.body.reservation.id).single());
      assert.equal(snapshot.total_price_aed, 4963.14);
      assert.equal(snapshot.platform_fee_bps, 100);
      assert.equal(snapshot.customer_fee_standard_bps, 100);
      assert.equal(snapshot.customer_fee_discount_percent, 0);
      assert.equal(snapshot.customer_fee_promo_order_number, null);
      const allocations = must(await admin.from('customer_fee_promotions').select('promo_order_number').eq('customer_user_id', fixtures.customer.id));
      assert.deepEqual(allocations.map(row => row.promo_order_number).sort(), [1, 2, 3]);
    });
    await t.test('A cancelled unpaid order releases its introductory discount slot', async () => {
      assert.ok(cardOrder, 'third promotional order must exist');
      must(await admin.from('reservations').update({ status: 'cancelled' }).eq('id', cardOrder.id));
      activeClient = fixtures.customer.client;
      const check = await identity(fixtures.customer, products[0]);
      const created = await route('reservations', { productId: products[0].id, quantity: 1,
        identityVerificationId: check.id, paymentMethod: 'cash', fulfilmentMethod: 'collection' });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      reservations.push(created.body.reservation.id);
      const snapshot = must(await admin.from('order_price_snapshots').select('*').eq('reservation_id', created.body.reservation.id).single());
      assert.equal(snapshot.total_price_aed, 4938.57);
      assert.equal(snapshot.platform_fee_bps, 50);
      assert.equal(snapshot.customer_fee_promo_order_number, 3);
      const slot = must(await admin.from('customer_fee_promotions').select('reservation_id').eq('customer_user_id', fixtures.customer.id).eq('promo_order_number', 3).single());
      assert.equal(slot.reservation_id, created.body.reservation.id);
    });
  } finally {
    // Delete only this run's generated fixtures, never broad tables or existing data.
    for (const id of reservations) {
      const row = must(await admin.from('reservations').select('transfer_proof_path').eq('id', id).single());
      if (row.transfer_proof_path) must(await admin.storage.from('payment-proofs').remove([row.transfer_proof_path]));
      must(await admin.from('reservations').delete().eq('id', id));
    }
    for (const id of users) must(await admin.from('order_identity_verifications').delete().eq('user_id', id));
    for (const product of products) must(await admin.from('products').delete().eq('id', product.id));
    if (companyId) must(await admin.from('delivery_companies').delete().eq('id', companyId));
    if (onboardingVendorId) must(await admin.from('vendors').delete().eq('id', onboardingVendorId));
    if (vendorId) must(await admin.from('vendors').delete().eq('id', vendorId));
    for (const id of ticks) must(await admin.from('gold_price_ticks').delete().eq('id', id));
    if (fixtures.admin_test) {
      must(await admin.from('site_banners').delete().eq('created_by_user_id', fixtures.admin_test.id));
      must(await admin.from('marketplace_promotions').delete().eq('created_by_user_id', fixtures.admin_test.id));
      must(await admin.from('vendor_promotions').delete().eq('created_by_user_id', fixtures.admin_test.id));
    }
    for (const id of users) must(await admin.auth.admin.deleteUser(id));
    must(await admin.from('platform_settings').update({ delivery_fee_aed: previousSettings.delivery_fee_aed, platform_fee_bps: previousSettings.platform_fee_bps }).eq('id', true));
  }
});

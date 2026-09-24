// Run with npm run dev:local. Uses only disposable, loopback database fixtures.
// Set PLAYWRIGHT_MODULE to a local Playwright install when not in node_modules.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { localRuntime } = require('./local-runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const cfg = localRuntime();
  assert.equal(cfg.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
  const admin = createClient(cfg.NEXT_PUBLIC_SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const must = r => { assert.equal(r.error, null, r.error?.message); return r.data; };
  const out = path.resolve(__dirname, '../output/vendor-workspace-20260922');
  fs.mkdirSync(out, { recursive: true });
  let browser, userId, vendorId;
  const browserErrors = [];
  try {
    const email = 'vendor-ui-' + randomUUID() + '@example.invalid', password = 'Test-' + randomUUID() + '!';
    userId = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'vendor', full_name: 'Workspace Test Owner' } })).user.id;
    vendorId = must(await admin.from('vendors').insert({ owner_user_id: userId, business_name: 'Heritage Gold · Test Store', trade_license_number: 'UI-' + randomUUID(), license_expiry_date: '2099-01-01', owner_name: 'Workspace Test Owner', email, phone: '+971500000000', emirate: 'Dubai', store_address: 'Synthetic Gold Souq test address', store_latitude: 25.286, store_longitude: 55.296, verification_status: 'approved' }).select('id').single()).id;
    const product = must(await admin.from('products').insert({ vendor_id: vendorId, name: '22K Heritage jewellery set', description: 'Synthetic test catalogue entry for workspace validation only.', category: 'other', karat: 22, weight_grams: 10, making_charge: 220, quantity: 12, images: [], product_status: 'draft' }).select('id').single());
    // Status fixtures test rendering/grouping only; real state transitions are covered by integration tests.
    for (const [status, payment_method] of [['pending_vendor_confirmation', 'aani'], ['payment_verification', 'aani'], ['preparing_order', 'aani'], ['vendor_confirmed', 'aani'], ['completed', 'cash']]) {
      must(await admin.from('reservations').insert({ vendor_id: vendorId, customer_user_id: userId, product_id: product.id, status, payment_method, quantity: 1, fulfilment_method: 'collection', expires_at: new Date(Date.now() + 3600000).toISOString(), vendor_action_available_at: new Date(Date.now() - 60000).toISOString(), vendor_confirmed_price_aed: status === 'pending_vendor_confirmation' ? null : 5320, transfer_reference: status === 'payment_verification' ? 'TEST-AANI-123' : null, transfer_submitted_at: status === 'payment_verification' ? new Date().toISOString() : null }));
    }
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const jar = new Map();
    const client = createServerClient(cfg.NEXT_PUBLIC_SUPABASE_URL, cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name,value]) => ({ name,value })), setAll: rows => rows.forEach(r => jar.set(r.name, r.value)) } });
    must(await client.auth.signInWithPassword({ email, password }));
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: 'http://127.0.0.1:3000', sameSite: 'Lax' })));
    const page = await context.newPage();
    page.on('pageerror', e => browserErrors.push(e.message));
    page.setDefaultTimeout(30000);
    async function visit(route) {
      await page.goto('http://127.0.0.1:3000' + route, { waitUntil: 'networkidle', timeout: 90000 });
      assert.equal(await page.getByText('We couldn’t load your store', { exact: true }).count(), 0, route + ' rendered error boundary');
      assert.equal(await page.getByText('تعذر تحميل بيانات المتجر', { exact: true }).count(), 0, route + ' rendered Arabic error boundary');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, route + ' horizontal overflow');
      console.log('PASS browser ' + route);
    }
    await visit('/vendor');
    await page.screenshot({ path: path.join(out, 'vendor-overview-desktop.png'), fullPage: true });
    await visit('/vendor/orders?filter=payments');
    assert.equal(await page.getByRole('button', { name: 'Confirm payment received', exact: true }).count(), 1);
    assert.equal(await page.getByText('TEST-AANI-123').count() > 0, true);
    await page.screenshot({ path: path.join(out, 'vendor-orders-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: /Confirm requests/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Confirm item & send price', exact: true }).count(), 1);
    await visit('/vendor/products');
    await page.getByRole('searchbox').fill('does-not-exist');
    await page.getByRole('button', { name: 'Show everything', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show everything', exact: true }).click();
    await page.getByRole('link', { name: 'Edit product', exact: true }).waitFor();
    await visit('/vendor/products/new');
    await page.getByRole('textbox', { name: 'Product name', exact: true }).fill('22K Heritage jewellery set');
    await page.locator('[name="category"]').selectOption('other');
    await page.locator('[name="weight_grams"]').fill('10');
    await page.locator('[name="making_charge"]').fill('220');
    await page.locator('textarea[name="description"]').fill('A heritage jewellery set used only for isolated browser validation.');
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await page.locator('form [role="alert"]').waitFor();
    assert.match(await page.locator('form [role="alert"]').innerText(), /photograph/i);
    await page.locator('#product-photos').setInputFiles(path.resolve(__dirname, '../public/images/uae-heritage-hero.webp'));
    await page.getByText('Uploading photos…', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.waitForURL('**/vendor/products?saved=draft');
    assert.equal(must(await admin.from('products').select('id').eq('vendor_id', vendorId)).length, 2);
    await visit('/vendor/payments');
    await page.getByRole('checkbox', { name: /Aani instant transfer/ }).check();
    await page.getByRole('textbox', { name: 'Aani registered UAE mobile', exact: true }).fill('0501234567');
    await page.getByRole('button', { name: 'Save payment & delivery settings', exact: true }).click();
    await page.getByText('Payment and delivery settings saved. Existing orders retain their original details.', { exact: true }).waitFor();
    assert.equal(must(await admin.from('vendor_payment_settings').select('aani_enabled').eq('vendor_id', vendorId).single()).aani_enabled, true);
    await page.getByRole('button', { name: 'Copy to open days', exact: true }).first().click();
    await page.getByRole('button', { name: 'Save working hours', exact: true }).click();
    await page.getByText('Working hours saved.', { exact: true }).waitFor();
    assert.equal(must(await admin.from('vendor_working_hours').select('day_of_week').eq('vendor_id', vendorId)).length, 7);
    for (const language of ['en', 'ar']) {
      await context.addCookies([{ name: 'gg_lang', value: language, url: 'http://127.0.0.1:3000' }]);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ['/vendor', '/vendor/products', '/vendor/orders', '/vendor/products/new', '/vendor/payments', '/vendor/documents', '/vendor/register', '/vendor/reviews', '/vendor/requests', '/vendor/catalogue-support']) await visit(route);
      await visit('/vendor');
      await page.screenshot({ path: path.join(out, 'vendor-overview-mobile-' + language + '.png'), fullPage: true });
    }
    assert.deepEqual(browserErrors, [], 'Browser runtime errors');
    console.log('PASS vendor workspace interactions, desktop/mobile, English/Arabic; screenshots: ' + out);
  } finally {
    if (browser) await browser.close();
    if (vendorId) {
      must(await admin.from('reservations').delete().eq('vendor_id', vendorId));
      must(await admin.from('products').delete().eq('vendor_id', vendorId));
      const files = must(await admin.storage.from('product-images').list(vendorId));
      if (files.length) must(await admin.storage.from('product-images').remove(files.map(f => vendorId + '/' + f.name)));
      must(await admin.from('vendors').delete().eq('id', vendorId));
    }
    if (userId) must(await admin.auth.admin.deleteUser(userId));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

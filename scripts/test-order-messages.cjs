// Run while `npm run dev:local` is serving the isolated local stack.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { localRuntime } = require("./local-runtime.cjs");

(async () => {
  const cfg = localRuntime();
  const base = "http://127.0.0.1:3000";
  const admin = createClient(
    cfg.NEXT_PUBLIC_SUPABASE_URL,
    cfg.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    },
  );
  const must = (result) => {
    assert.equal(result.error, null, result.error?.message);
    return result.data;
  };
  const users = [];
  let vendorId;
  let productId;
  let orderId;
  let unacceptedOrderId;
  let browser;

  async function createUser(role) {
    const email = `messages-${role}-${randomUUID()}@example.invalid`;
    const password = `Test-${randomUUID()}!`;
    const user = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, full_name: `${role} message test` },
      }),
    ).user;
    users.push(user.id);
    return { id: user.id, email, password };
  }

  async function cookieFor(account) {
    const jar = new Map();
    const client = createServerClient(
      cfg.NEXT_PUBLIC_SUPABASE_URL,
      cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (rows) => rows.forEach((row) => jar.set(row.name, row.value)),
        },
      },
    );
    must(
      await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      }),
    );
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async function call(cookie, path, init = {}) {
    return fetch(base + path, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie },
      redirect: "manual",
    });
  }

  try {
    const customer = await createUser("customer");
    const vendor = await createUser("vendor");
    const outsider = await createUser("customer");
    vendorId = must(
      await admin
        .from("vendors")
        .insert({
          owner_user_id: vendor.id,
          business_name: "Order Messages Test Store",
          trade_license_number: `MSG-${randomUUID()}`,
          license_expiry_date: "2099-01-01",
          owner_name: "Vendor message test",
          email: vendor.email,
          phone: "+971500000000",
          emirate: "Dubai",
          store_address: "Synthetic test address",
          verification_status: "approved",
        })
        .select("id")
        .single(),
    ).id;
    productId = must(
      await admin
        .from("products")
        .insert({
          vendor_id: vendorId,
          name: "22K message test ring",
          description:
            "Synthetic fixture for private order conversation validation.",
          category: "ring",
          karat: 22,
          weight_grams: 5,
          making_charge: 100,
          quantity: 2,
          images: ["test-only/message-product.jpg"],
          hallmark_info: "Synthetic 22K hallmark",
          product_status: "approved",
        })
        .select("id")
        .single(),
    ).id;
    const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
    orderId = must(
      await admin
        .from("reservations")
        .insert({
          customer_user_id: customer.id,
          product_id: productId,
          vendor_id: vendorId,
          status: "payment_pending",
          quantity: 1,
          expires_at: deadline,
          payment_method: "card",
          payment_status: "awaiting_customer_payment",
          fulfilment_method: "collection",
          vendor_confirmed_price_aed: 2500,
        })
        .select("id")
        .single(),
    ).id;
    unacceptedOrderId = must(
      await admin
        .from("reservations")
        .insert({
          customer_user_id: customer.id,
          product_id: productId,
          vendor_id: vendorId,
          status: "vendor_confirmed",
          quantity: 1,
          expires_at: deadline,
          payment_method: "card",
          payment_status: "awaiting_customer_acceptance",
          fulfilment_method: "collection",
          vendor_confirmed_price_aed: 2500,
        })
        .select("id")
        .single(),
    ).id;

    const [customerCookie, vendorCookie, outsiderCookie] = await Promise.all([
      cookieFor(customer),
      cookieFor(vendor),
      cookieFor(outsider),
    ]);
    let response = await call(customerCookie, "/api/orders/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: orderId,
        messageType: "text",
        body: "Can you prepare this for collection today?",
      }),
    });
    assert.equal(response.status, 201);
    response = await call(vendorCookie, "/api/orders/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: orderId,
        messageType: "payment_link",
        body: "Use this store payment page for the confirmed total.",
        paymentUrl: "https://pay.example.com/getgold/test",
      }),
    });
    assert.equal(response.status, 201);
    response = await call(vendorCookie, "/api/orders/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: unacceptedOrderId,
        messageType: "payment_link",
        body: "This must remain locked.",
        paymentUrl: "https://pay.example.com/getgold/too-early",
      }),
    });
    assert.equal(
      response.status,
      409,
      "vendor cannot request payment before customer acceptance",
    );
    response = await call(customerCookie, "/api/orders/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: orderId,
        messageType: "payment_link",
        body: "Forged customer link",
        paymentUrl: "https://pay.example.com/forged",
      }),
    });
    assert.equal(
      response.status,
      409,
      "customer cannot create a structured vendor payment link",
    );
    response = await call(
      outsiderCookie,
      `/api/orders/messages?reservationId=${orderId}`,
    );
    assert.equal(
      response.status,
      404,
      "unrelated customer cannot discover the conversation",
    );
    response = await call(
      customerCookie,
      `/api/orders/messages?reservationId=${orderId}`,
    );
    assert.equal(response.status, 200);
    const inbox = await response.json();
    assert.equal(inbox.messages.length, 2);
    assert.deepEqual(
      inbox.messages.map((message) => message.sender_role),
      ["customer", "vendor"],
    );
    const customerPage = await call(
      customerCookie,
      `/account/reservations/${orderId}`,
    );
    const vendorPage = await call(vendorCookie, `/vendor/orders/${orderId}`);
    assert.equal(customerPage.status, 200);
    assert.equal(vendorPage.status, 200);
    assert.match(await customerPage.text(), /Private order conversation/);
    assert.match(await vendorPage.text(), /Message the other party/);
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const browserErrors = [];
    async function conversationPage(cookie, path) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.addCookies(
        cookie.split("; ").map((entry) => {
          const split = entry.indexOf("=");
          return {
            name: entry.slice(0, split),
            value: entry.slice(split + 1),
            url: base,
            sameSite: "Lax",
          };
        }),
      );
      const page = await context.newPage();
      page.on("pageerror", (error) => browserErrors.push(error.message));
      await page.goto(base + path, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page
        .getByText("Use this store payment page for the confirmed total.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        ),
        false,
      );
      return { context, page };
    }
    const customerBrowser = await conversationPage(
      customerCookie,
      `/account/reservations/${orderId}`,
    );
    await customerBrowser.page
      .getByRole("link", { name: "Open secure payment link ↗" })
      .waitFor();
    await customerBrowser.context.close();
    const vendorBrowser = await conversationPage(
      vendorCookie,
      `/vendor/orders/${orderId}`,
    );
    await vendorBrowser.page
      .getByRole("button", { name: "＋ Add payment link" })
      .click();
    await vendorBrowser.page
      .getByRole("textbox", { name: "Secure HTTPS payment link" })
      .waitFor();
    await vendorBrowser.context.close();
    assert.deepEqual(
      browserErrors,
      [],
      "conversation pages have no browser runtime errors",
    );
    const unchanged = must(
      await admin
        .from("reservations")
        .select("status, payment_status, payment_confirmed_at")
        .eq("id", orderId)
        .single(),
    );
    assert.deepEqual(unchanged, {
      status: "payment_pending",
      payment_status: "awaiting_customer_payment",
      payment_confirmed_at: null,
    });
    assert.equal(
      must(
        await admin
          .from("notifications")
          .select("id")
          .in("user_id", [customer.id, vendor.id]),
      ).length,
      2,
    );
    console.log(
      "PASS private customer/vendor messages, payment-link gate, notifications and unchanged payment state",
    );
  } finally {
    if (browser) await browser.close();
    if (orderId || unacceptedOrderId)
      await admin
        .from("reservations")
        .delete()
        .in("id", [orderId, unacceptedOrderId].filter(Boolean));
    if (productId) await admin.from("products").delete().eq("id", productId);
    if (vendorId) await admin.from("vendors").delete().eq("id", vendorId);
    for (const userId of users) await admin.auth.admin.deleteUser(userId);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

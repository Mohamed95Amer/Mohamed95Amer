// Disposable fixtures on loopback only. Never runs against hosted Supabase.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const { localRuntime } = require("./local-runtime.cjs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const cfg = localRuntime();
  assert.equal(cfg.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
  const db = createClient(
    cfg.NEXT_PUBLIC_SUPABASE_URL,
    cfg.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const must = (r) => {
    assert.equal(r.error, null, r.error?.message);
    return r.data;
  };
  const users = [],
    campaignIds = [],
    browserErrors = [];
  let browser, vendorId;
  const out = path.resolve(__dirname, "../output/admin-workspace-20260923");
  fs.mkdirSync(out, { recursive: true });
  const sql = (query) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_getgold_validation",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: query, encoding: "utf8", windowsHide: true },
    );
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const actors = {};
    for (const role of ["admin", "vendor", "customer", "optout"]) {
      const email = "admin-ui-" + randomUUID() + "@example.invalid",
        password = "Test-" + randomUUID() + "!";
      const user = must(
        await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            role: role === "vendor" ? "vendor" : "customer",
            full_name: "Synthetic " + role,
          },
        }),
      ).user;
      users.push(user.id);
      if (role === "admin")
        must(
          await db.from("profiles").update({ role: "admin" }).eq("id", user.id),
        );
      const jar = new Map(),
        auth = createServerClient(
          cfg.NEXT_PUBLIC_SUPABASE_URL,
          cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          {
            cookies: {
              getAll: () => [...jar].map(([name, value]) => ({ name, value })),
              setAll: (rows) => rows.forEach((r) => jar.set(r.name, r.value)),
            },
          },
        );
      must(await auth.auth.signInWithPassword({ email, password }));
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1080 },
      });
      await context.addCookies(
        [...jar].map(([name, value]) => ({
          name,
          value,
          url: "http://127.0.0.1:3000",
          sameSite: "Lax",
        })),
      );
      actors[role] = { ...user, auth, context };
    }
    must(
      await db
        .from("user_preferences")
        .upsert({ user_id: actors.customer.id, marketing_notifications: true }),
    );
    vendorId = must(
      await db
        .from("vendors")
        .insert({
          owner_user_id: actors.vendor.id,
          business_name: "Admin QA Gold Store",
          trade_license_number: "QA-" + randomUUID(),
          license_expiry_date: "2099-01-01",
          owner_name: "Synthetic Owner",
          email: actors.vendor.email,
          phone: "+971500000000",
          emirate: "Dubai",
          store_address: "Synthetic test address",
          verification_status: "approved",
        })
        .select("id")
        .single(),
    ).id;
    const product = must(
      await db
        .from("products")
        .insert({
          vendor_id: vendorId,
          name: "QA gold bar",
          description: "Synthetic test only",
          category: "bar",
          karat: 24,
          weight_grams: 10,
          making_charge: 0,
          quantity: 10,
          images: [],
          product_status: "draft",
        })
        .select("id")
        .single(),
    );
    const tick = must(
      await db
        .from("gold_price_ticks")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .single(),
    );
    const order = must(
      await db
        .from("reservations")
        .insert({
          vendor_id: vendorId,
          customer_user_id: actors.customer.id,
          product_id: product.id,
          status: "completed",
          payment_status: "paid",
          quantity: 3,
          fulfilment_method: "collection",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          payment_confirmed_at: new Date().toISOString(),
          vendor_confirmed_price_aed: 3000,
        })
        .select("id")
        .single(),
    );
    must(
      await db.from("order_price_snapshots").insert({
        reservation_id: order.id,
        gold_tick_id: tick.id,
        gold_price_per_gram_24k_aed: 100,
        karat: 24,
        karat_purity_factor: 0.999,
        weight_grams: 10,
        making_charge: 0,
        stone_value: 0,
        vendor_premium: 0,
        platform_fee: 10,
        delivery_fee: 0,
        delivery_fee_before_event_discount: 5,
        quantity: 3,
        gold_value_aed: 999,
        unit_price_aed: 1000,
        total_price_aed: 3000,
        gold_price_fetched_at: new Date().toISOString(),
        customer_fee_standard_bps: 100,
      }),
    );
    const view = must(
      await db
        .from("admin_commission_orders")
        .select("*")
        .eq("id", order.id)
        .single(),
    );
    assert.equal(view.fee_aed, 30);
    assert.equal(view.delivery_credit_aed, 5);
    assert.equal(
      (await actors.customer.auth.from("commission_ledger").select("*")).error
        ?.code,
      "42501",
    );
    assert.ok(
      (
        await actors.vendor.auth.rpc("manage_commission_entry", {
          p_actor: actors.admin.id,
          p_action: "create",
          p_id: randomUUID(),
        })
      ).error,
    );
    async function api(who, route, data) {
      const r = await actors[who].context.request.post(
        "http://127.0.0.1:3000/api/" + route,
        { data },
      );
      return { status: r.status(), body: await r.json() };
    }
    assert.equal(
      (
        await api("customer", "admin/commission-ledger", {
          action: "void",
          id: randomUUID(),
          note: "Unauthorized test",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await api("vendor", "admin/notification-campaigns", {
          action: "cancel",
          id: randomUUID(),
        })
      ).status,
      401,
    );
    const page = await actors.admin.context.newPage();
    page.on("pageerror", (e) => browserErrors.push(e.message));
    page.setDefaultTimeout(30000);
    async function visit(p, route) {
      const r = await p.goto("http://127.0.0.1:3000" + route, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      assert.equal(r.status(), 200, route);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        ),
        false,
        route + " overflow",
      );
    }
    await visit(page, "/admin");
    await page
      .getByRole("heading", { name: "A clear view. Confident decisions." })
      .waitFor();
    await page.getByLabel("Store", { exact: true }).selectOption(vendorId);
    await page.getByLabel("Period", { exact: true }).selectOption("7");
    await page.screenshot({
      path: path.join(out, "admin-overview-desktop.png"),
      fullPage: true,
    });
    await visit(page, "/admin/commissions");
    await page
      .getByLabel("Store account", { exact: true })
      .selectOption(vendorId);
    await page.getByLabel("Amount (AED)", { exact: true }).fill("10");
    await page
      .getByLabel("Bank / receipt reference", { exact: true })
      .fill("QA-RECEIPT");
    await page
      .getByLabel("Reason / reconciliation note", { exact: true })
      .fill("Synthetic remittance test");
    await page.getByRole("checkbox", { name: /I checked Get Gold/ }).check();
    await page
      .getByRole("button", { name: "Record entry", exact: true })
      .click();
    await page
      .getByText(
        "Saved to the ledger and audit log. No money was transferred.",
        { exact: true },
      )
      .waitFor();
    const receipt = must(
      await db
        .from("commission_ledger")
        .select("*")
        .eq("vendor_id", vendorId)
        .single(),
    );
    assert.equal(receipt.amount_aed, 10);
    assert.equal(
      must(
        await db
          .from("audit_logs")
          .select("id")
          .eq("entity_id", receipt.id)
          .eq("action", "commission.create"),
      ).length,
      1,
    );
    assert.equal(
      (
        await api("admin", "admin/commission-ledger", {
          action: "create",
          id: receipt.id,
          vendorId,
          kind: "receipt",
          amount: 10,
          note: "duplicate retry test",
          reference: "QA-RECEIPT",
        })
      ).status,
      409,
    );
    await page
      .getByRole("button", { name: "Void this entry", exact: true })
      .click();
    await page
      .getByLabel("Reason for voiding", { exact: true })
      .fill("Synthetic correction test");
    await page
      .getByRole("button", { name: "Confirm void", exact: true })
      .click();
    await page
      .getByText("Voided: Synthetic correction test", { exact: true })
      .waitFor();
    assert.ok(
      must(
        await db
          .from("commission_ledger")
          .select("voided_at")
          .eq("id", receipt.id)
          .single(),
      ).voided_at,
    );
    await page.screenshot({
      path: path.join(out, "admin-commissions-desktop.png"),
      fullPage: true,
    });
    await visit(page, "/admin/notifications");
    await page
      .getByLabel("Title", { exact: true })
      .fill("QA limited-time gold offer");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Synthetic local offer. No real customer receives this.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).waitFor();
    const campaign = must(
      await db
        .from("notification_campaigns")
        .select("*")
        .eq("created_by", actors.admin.id)
        .single(),
    );
    campaignIds.push(campaign.id);
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      0,
      "draft invisible",
    );
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByText("Live", { exact: true }).waitFor();
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.optout.id,
        }),
      ).length,
      0,
      "optout excluded",
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.vendor.id,
        }),
      ).length,
      0,
      "vendors excluded",
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      1,
    );
    const customerPage = await actors.customer.context.newPage();
    customerPage.on("pageerror", (e) => browserErrors.push(e.message));
    await visit(customerPage, "/account/notifications");
    await customerPage
      .getByRole("heading", { name: "QA limited-time gold offer", exact: true })
      .waitFor();
    const markResponse = customerPage.waitForResponse(
      (r) =>
        r.url().endsWith("/api/account/notifications") &&
        r.request().method() === "POST",
    );
    await customerPage
      .getByRole("button", { name: "Mark read", exact: true })
      .click();
    assert.equal((await markResponse).status(), 200);
    await customerPage
      .getByRole("button", { name: "Updating…", exact: true })
      .waitFor({ state: "hidden" });
    assert.ok(
      must(
        await db
          .from("notification_campaign_reads")
          .select("read_at")
          .eq("campaign_id", campaign.id)
          .eq("user_id", actors.customer.id)
          .single(),
      ).read_at,
    );
    assert.equal(
      (
        await api("optout", "account/notifications", {
          campaignId: campaign.id,
        })
      ).status,
      404,
    );
    // Future operational updates must not be swallowed by "mark all".
    const future = must(
      await db
        .from("notifications")
        .insert({
          user_id: actors.customer.id,
          kind: "system",
          title: "Future QA",
          body: "Not ready",
          available_at: new Date(Date.now() + 86400000).toISOString(),
        })
        .select("id")
        .single(),
    );
    assert.equal(
      (await api("customer", "account/notifications", { all: true })).status,
      200,
    );
    assert.equal(
      must(
        await db
          .from("notifications")
          .select("read_at")
          .eq("id", future.id)
          .single(),
      ).read_at,
      null,
    );
    // Dynamic audience, scheduling and expiry checks go through PostgREST.
    must(
      await db
        .from("notification_campaigns")
        .update({ audience: "new_customers" })
        .eq("id", campaign.id),
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      0,
    );
    must(
      await db
        .from("notification_campaigns")
        .update({ audience: "buyers" })
        .eq("id", campaign.id),
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      1,
    );
    must(
      await db
        .from("notification_campaigns")
        .update({ starts_at: new Date(Date.now() + 3600000).toISOString() })
        .eq("id", campaign.id),
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      0,
    );
    must(
      await db
        .from("notification_campaigns")
        .update({
          starts_at: new Date(Date.now() - 7200000).toISOString(),
          ends_at: new Date(Date.now() - 3600000).toISOString(),
        })
        .eq("id", campaign.id),
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      0,
    );
    must(
      await db
        .from("notification_campaigns")
        .update({
          starts_at: new Date(Date.now() - 3600000).toISOString(),
          ends_at: new Date(Date.now() + 3600000).toISOString(),
        })
        .eq("id", campaign.id),
    );
    assert.equal(
      (
        await api("admin", "admin/notification-campaigns", {
          action: "cancel",
          id: campaign.id,
        })
      ).status,
      200,
    );
    assert.equal(
      must(
        await db.rpc("customer_campaign_inbox", {
          p_user_id: actors.customer.id,
        }),
      ).length,
      0,
    );
    assert.equal(
      (
        await api("admin", "admin/notification-campaigns", {
          action: "publish",
          id: campaign.id,
        })
      ).status,
      409,
    );
    for (const lang of ["en", "ar"]) {
      await actors.admin.context.addCookies([
        { name: "gg_lang", value: lang, url: "http://127.0.0.1:3000" },
      ]);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of [
        "/admin",
        "/admin/commissions",
        "/admin/notifications",
      ]) {
        await visit(page, route);
        await page.screenshot({
          path: path.join(
            out,
            route.replaceAll("/", "-").slice(1) + "-mobile-" + lang + ".png",
          ),
          fullPage: true,
        });
      }
      await actors.customer.context.addCookies([
        { name: "gg_lang", value: lang, url: "http://127.0.0.1:3000" },
      ]);
      await customerPage.setViewportSize({ width: 390, height: 844 });
      await visit(customerPage, "/account/notifications");
    }
    assert.deepEqual(browserErrors, []);
    console.log(
      "PASS: admin charts, receipt/void/audit, retry idempotency, admin isolation, campaign draft/publish/consent/audience/read/schedule/expiry/cancel; desktop/mobile EN/AR. Screenshots: " +
        out,
    );
  } finally {
    if (browser) await browser.close();
    // Explicit isolated UUIDs only; deletes synthetic financial entries unavailable to service role by design.
    if (users.length) {
      assert.ok(users.every((id) => /^[0-9a-f-]{36}$/.test(id)));
      const list = users.map((id) => "'" + id + "'").join(",");
      sql(
        "delete from public.commission_ledger where created_by in (" +
          list +
          "); delete from public.notification_campaigns where created_by in (" +
          list +
          "); delete from public.audit_logs where actor_user_id in (" +
          list +
          ");",
      );
    }
    if (vendorId) {
      must(await db.from("reservations").delete().eq("vendor_id", vendorId));
      must(await db.from("products").delete().eq("vendor_id", vendorId));
      must(await db.from("vendors").delete().eq("id", vendorId));
    }
    for (const id of users) must(await db.auth.admin.deleteUser(id));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLoader } = require("./load-ts.cjs");
const load = createLoader();
const { summarizeCommissions, commissionTrend, dubaiDay } = load(
  "src/lib/admin/commissions.ts",
);
const { campaignSchema, campaignStatus } = load(
  "src/lib/notifications/campaigns.ts",
);
const paid = {
  id: "a",
  vendor_id: "v",
  status: "completed",
  payment_status: "paid",
  is_demo: false,
  has_snapshot: true,
  current_fee_model: true,
  order_total_aed: 1030,
  fee_aed: 30,
  delivery_credit_aed: 10,
  created_at: "2026-09-20T12:00:00Z",
  earned_at: "2026-09-22T20:01:00Z",
};
test("commission balance uses saved fees, delivery subsidy and signed ledger; never clamps credits", () => {
  const total = summarizeCommissions(
    [paid],
    [
      { kind: "receipt", amount_aed: 25 },
      { kind: "credit", amount_aed: 5 },
      { kind: "debit", amount_aed: 2 },
      { kind: "debit", amount_aed: 100, voided_at: "yes" },
    ],
  );
  assert.equal(total.earned, 3000);
  assert.equal(total.sales, 103000);
  assert.equal(total.balance, -800);
  assert.equal(total.received, 2500);
});
test("legacy, refunds, unpaid and expired holds are not earned; live unpaid fees stay separate", () => {
  const result = summarizeCommissions(
    [
      paid,
      { ...paid, current_fee_model: false },
      { ...paid, status: "refunded" },
      {
        ...paid,
        payment_status: "awaiting_vendor",
        status: "payment_pending",
        expires_at: "2000-01-01",
      },
      {
        ...paid,
        payment_status: "awaiting_vendor",
        status: "payment_verification",
      },
    ],
    [],
  );
  assert.equal(result.earned, 3000);
  assert.equal(result.legacy, 1);
  assert.equal(result.pending, 3000);
  assert.equal(result.paidCount, 2);
});
test("chart groups by Dubai payment date, fills empty dates, and reconciles fee totals", () => {
  assert.equal(dubaiDay(paid.earned_at), "2026-09-23");
  const bins = commissionTrend(
    [
      paid,
      { ...paid, current_fee_model: false },
      { ...paid, status: "refunded" },
    ],
    3,
    Date.parse("2026-09-23T01:00:00Z"),
  );
  assert.deepEqual(bins, [
    { day: "2026-09-21", fee: 0, orders: 0 },
    { day: "2026-09-22", fee: 0, orders: 0 },
    { day: "2026-09-23", fee: 3000, orders: 2 },
  ]);
});
const draft = {
  title: "New offer",
  body: "Explore the collection",
  href: "/marketplace",
  audience: "customers",
  starts_at: "2026-09-23T10:00:00+04:00",
  ends_at: "2026-09-24T10:00:00+04:00",
};
test("promotional validation rejects external links and invalid expiry windows", () => {
  assert.equal(campaignSchema.safeParse(draft).success, true);
  for (const href of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/marketplace\n",
  ])
    assert.equal(
      campaignSchema.safeParse({ ...draft, href }).success,
      href.endsWith("\n"),
      href,
    );
  assert.equal(
    campaignSchema.safeParse({ ...draft, ends_at: draft.starts_at }).success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({ ...draft, ends_at: "2027-09-24T10:00:00Z" })
      .success,
    false,
  );
});
test("campaign state has explicit draft, future, live, expired and cancelled boundaries", () => {
  const now = Date.parse("2026-09-23T12:00:00Z"),
    live = { ...draft, published_at: draft.starts_at, cancelled_at: null };
  assert.equal(campaignStatus({ ...live, published_at: null }, now), "Draft");
  assert.equal(campaignStatus(live, now), "Live");
  assert.equal(
    campaignStatus({ ...live, starts_at: "2026-09-24T00:00:00Z" }, now),
    "Scheduled",
  );
  assert.equal(campaignStatus(live, Date.parse(draft.ends_at)), "Expired");
  assert.equal(
    campaignStatus({ ...live, cancelled_at: draft.starts_at }, now),
    "Cancelled",
  );
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLoader } = require("./load-ts.cjs");
const load = createLoader();
const core = load("src/lib/gold-rate/core.ts");
const subs = load("src/lib/gold-rate/subscriptions.ts");

const k22 = core.rateKaratBySlug("22k");
const k24 = core.rateKaratBySlug("24K");

test("karat rates use the statutory UAE fineness", () => {
  assert.equal(core.karatRatePerGram(400, k24), 400);
  assert.equal(core.karatRatePerGram(400, k22), 366.4);
  assert.equal(core.karatRatePerGram(400, core.rateKaratBySlug("21k")), 350);
  assert.equal(core.karatRatePerGram(400, core.rateKaratBySlug("18k")), 300);
  assert.equal(core.karatRatePerGram(0, k22), 0);
  assert.equal(core.rateKaratBySlug("16k"), null);
});

test("weight prices cover tola and troy ounce", () => {
  assert.equal(core.weightPrice(366.4, core.TOLA_GRAMS), 4273.62);
  assert.equal(core.weightPrice(100, core.TROY_OUNCE_GRAMS), 3110.35);
});

const history = [
  { day: "2026-09-01", open: 390, high: 392, low: 389, close: 391 },
  { day: "2026-09-24", open: 395, high: 397, low: 394, close: 396 },
  { day: "2026-09-30", open: 398, high: 401, low: 397, close: 400 },
  { day: "2026-10-01", open: 400, high: 405, low: 399, close: 404 },
];

test("daily summary compares with yesterday's close and today's range", () => {
  const s = core.summarizeKaratRate(history, 404, k24, "2026-10-01");
  assert.equal(s.current, 404);
  assert.equal(s.previousClose, 400);
  assert.equal(s.change, 4);
  assert.equal(s.changePercent, 1);
  assert.equal(s.direction, "up");
  assert.equal(s.todayHigh, 405);
  assert.equal(s.todayLow, 399);
  assert.equal(s.weekChangePercent, 2.02); // vs 24 Sep close 396
  assert.equal(s.monthChangePercent, 3.32); // vs 1 Sep close 391
  assert.equal(s.monthLow, 389);
  assert.equal(s.monthHigh, 405);
});

test("summary scales to the karat and handles missing history", () => {
  const s = core.summarizeKaratRate(history, 404, k22, "2026-10-01");
  assert.equal(s.current, 370.06);
  assert.equal(s.previousClose, 366.4);
  const empty = core.summarizeKaratRate([], 404, k22, "2026-10-01");
  assert.equal(empty.previousClose, null);
  assert.equal(empty.direction, "unknown");
  assert.equal(empty.monthHigh, null);
});

test("summary text is factual in both languages", () => {
  const s = core.summarizeKaratRate(history, 404, k22, "2026-10-01");
  const en = core.dailySummaryText(s, k22, "en", "1 October 2026");
  assert.match(en, /22K gold rate in the UAE on 1 October 2026 is about AED 370\.06 per gram/);
  assert.match(en, /up AED 3\.66 \(\+1\.00%\)/);
  assert.match(en, /excludes making charges and VAT/);
  const ar = core.dailySummaryText(s, k22, "ar", "١ أكتوبر ٢٠٢٦");
  assert.match(ar, /عيار 22/);
  assert.match(ar, /ارتفع/);
});

test("twin paths switch between English and Arabic rate pages", () => {
  assert.equal(core.twinRatePath("/gold-rate/22k"), "/ar/gold-rate/22k");
  assert.equal(core.twinRatePath("/ar/gold-rate/18k"), "/gold-rate/18k");
  assert.equal(core.twinRatePath("/gold-rate"), "/ar/gold-rate");
  assert.equal(core.twinRatePath("/ar/gold-rate/"), "/gold-rate");
  assert.equal(core.twinRatePath("/marketplace"), null);
});

test("alert sign-up validation requires consent and a target for target alerts", () => {
  const base = { email: " Buyer@Example.com ", karat: 22, frequency: "daily", consent: true, locale: "en" };
  const ok = subs.rateAlertSchema.safeParse(base);
  assert.equal(ok.success, true);
  assert.equal(ok.data.email, "buyer@example.com");
  assert.equal(subs.rateAlertSchema.safeParse({ ...base, consent: false }).success, false);
  assert.equal(subs.rateAlertSchema.safeParse({ ...base, karat: 16 }).success, false);
  assert.equal(subs.rateAlertSchema.safeParse({ ...base, frequency: "target" }).success, false);
  assert.equal(subs.rateAlertSchema.safeParse({ ...base, frequency: "target", targetRateAed: 350 }).success, true);
});

test("WhatsApp numbers are normalised or dropped", () => {
  assert.equal(subs.normalizeWhatsapp("+971 50 908 1312"), "+971509081312");
  assert.equal(subs.normalizeWhatsapp("050-908-1312"), "0509081312");
  assert.equal(subs.normalizeWhatsapp("123"), null);
  assert.equal(subs.normalizeWhatsapp(""), null);
});

test("alerts are due once per Dubai day, or when a target is reached", () => {
  const now = new Date("2026-10-01T05:00:00Z"); // 09:00 Dubai
  assert.equal(subs.isAlertDue({ frequency: "daily", target_rate_aed: null, last_sent_at: null }, 370, now), true);
  assert.equal(subs.isAlertDue({ frequency: "daily", target_rate_aed: null, last_sent_at: "2026-09-30T21:00:00Z" }, 370, now), false); // 01:00 Dubai, same day
  assert.equal(subs.isAlertDue({ frequency: "daily", target_rate_aed: null, last_sent_at: "2026-09-30T05:00:00Z" }, 370, now), true);
  assert.equal(subs.isAlertDue({ frequency: "target", target_rate_aed: 360, last_sent_at: null }, 370, now), false);
  assert.equal(subs.isAlertDue({ frequency: "target", target_rate_aed: 375, last_sent_at: null }, 370, now), true);
  assert.equal(subs.isAlertDue({ frequency: "target", target_rate_aed: 375, last_sent_at: "2026-09-30T20:00:00Z" }, 370, now), false);
  assert.equal(subs.isAlertDue({ frequency: "daily", target_rate_aed: null, last_sent_at: null }, 0, now), false);
});

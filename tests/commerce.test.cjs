const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const load = createLoader();
const { deliveryPinUrl } = load('src/lib/fulfilment.ts');
const { applyCustomerServiceFee, computePrice, computeOrderTotal, goldRateForKarat } = load('src/lib/pricing/calc.ts');
const { calculateReservationValue } = load('src/lib/gold-insights.ts');
const { onlinePaymentCheckoutIsOperational } = load('src/lib/payments/readiness.ts');
const { canTransitionDelivery } = load('src/lib/delivery/transitions.ts');
const { deliveryStatusSchema } = load('src/lib/validation/schemas.ts');
const base = { pricePerGram24kAed: 500, karat: 24, weightGrams: 1, makingCharge: 100, makingChargeDiscountPercent: 0, makingChargeOfferEndsAt: null, certificateFee: 0, stoneValue: 0, vendorPremium: 0, platformFeeBps: 50, deliveryFee: 20, pricedAt: Date.parse('2026-09-14T00:00:00Z') };

test('missing or blank coordinates do not produce a false 0,0 map pin', () => {
  for (const value of [null, undefined, '', ' ']) assert.equal(deliveryPinUrl({ fulfilment_method: 'delivery', delivery_latitude: value, delivery_longitude: value }), null);
});
test('valid coordinates take priority; invalid coordinates use a safe HTTPS fallback', () => {
  assert.match(deliveryPinUrl({ fulfilment_method: 'delivery', delivery_latitude: '25.186', delivery_longitude: '55.263' }), /query=25.186,55.263$/);
  assert.equal(deliveryPinUrl({ fulfilment_method: 'delivery', delivery_latitude: 91, delivery_longitude: 181, delivery_map_link: 'https://maps.google.com/example' }), 'https://maps.google.com/example');
  assert.equal(deliveryPinUrl({ fulfilment_method: 'delivery', delivery_map_link: 'javascript:alert(1)' }), null);
});
test('first three orders receive a 0.5% customer service fee', () => {
  const price = computePrice(base);
  assert.equal(price.platformFee, 3);
  assert.equal(price.unitPriceAed, 623);
  assert.equal(goldRateForKarat(500, 22), 458);
});
test('customer service fee becomes 1% after the introductory orders', () => {
  const introductory = computePrice(base);
  const standard = applyCustomerServiceFee(introductory, 100);
  assert.equal(standard.platformFeeBps, 100);
  assert.equal(standard.platformFee, 6);
  assert.equal(standard.unitPriceAed, 626);
  assert.equal(computeOrderTotal(standard, 3), 1838);
});
test('making charge discount reduces customer price and customer fee', () => {
  const price = computePrice({ ...base, makingChargeDiscountPercent: 20 });
  assert.equal(price.makingCharge, 80);
  assert.equal(price.platformFee, 2.9);
  assert.equal(price.unitPriceAed, 602.9);
});
test('100% making offer expires at its exact deadline', () => {
  const active = computePrice({ ...base, makingChargeDiscountPercent: 100, makingChargeOfferEndsAt: '2026-09-15T00:00:00Z' });
  assert.equal(active.makingCharge, 0);
  const expired = computePrice({ ...base, makingChargeDiscountPercent: 100, makingChargeOfferEndsAt: '2026-09-14T00:00:00Z' });
  assert.equal(expired.makingCharge, 100);
});
test('certificate-only bars retain their certificate charge when making is zero', () => {
  const price = computePrice({ ...base, makingCharge: 0, certificateFee: 25 });
  assert.equal(price.makingCharge, 0);
  assert.equal(price.certificateFee, 25);
  assert.equal(price.platformFee, 2.63);
  assert.equal(price.unitPriceAed, 547.63);
});
test('online checkout remains disabled until an actual processor is integrated', () => {
  assert.equal(onlinePaymentCheckoutIsOperational(), false);
});
test('delivery is charged once for a multi-item order; collection is free', () => {
  assert.equal(computeOrderTotal(computePrice(base), 3), 1829);
  assert.equal(computeOrderTotal(computePrice(base), 1), 623);
  assert.equal(computeOrderTotal(computePrice({ ...base, deliveryFee: 0 }), 3), 1809);
  for (const quantity of [0, -1, 1.5, 51, NaN]) assert.throws(() => computeOrderTotal(computePrice(base), quantity));
});
test('gold insights preserve both legacy and per-order delivery without invented savings', () => {
  const snapshot = { gold_price_per_gram_24k_aed: 500, karat_purity_factor: 1, weight_grams: 1, gold_value_aed: 500, quantity: 3 };
  for (const total of [1869, 1829]) {
    assert.equal(calculateReservationValue({ ...snapshot, total_price_aed: total }, 500).differenceAed, 0);
    assert.equal(calculateReservationValue({ ...snapshot, total_price_aed: total }, 510).currentComparableTotalAed, total + 30);
  }
});
test('courier lifecycle allows forward progress and a failed-delivery retry', () => {
  for (const [from, to] of [['offered', 'accepted'], ['offered', 'declined'], ['accepted', 'pickup_scheduled'], ['pickup_scheduled', 'collected'], ['collected', 'out_for_delivery'], ['out_for_delivery', 'delivered'], ['out_for_delivery', 'delivery_failed'], ['delivery_failed', 'out_for_delivery']]) {
    assert.equal(canTransitionDelivery(from, to), true);
  }
});
test('courier lifecycle cannot skip capture or reopen a terminal state', () => {
  for (const [from, to] of [['offered', 'delivered'], ['accepted', 'collected'], ['delivered', 'out_for_delivery'], ['declined', 'accepted'], ['cancelled', 'accepted'], ['unknown', 'accepted']]) {
    assert.equal(canTransitionDelivery(from, to), false);
  }
});
test('delivery completion requires a separate nonblank proof reference', () => {
  const assignmentId = '11111111-1111-4111-8111-111111111111';
  for (const proofReference of [undefined, null, '', '   ']) {
    assert.equal(deliveryStatusSchema.safeParse({ assignmentId, status: 'delivered', proofReference, publicNote: 'A note is not proof' }).success, false);
  }
  assert.equal(deliveryStatusSchema.safeParse({ assignmentId, status: 'delivered', proofReference: 'POD-TEST-1' }).success, true);
  assert.equal(deliveryStatusSchema.safeParse({ assignmentId, status: 'accepted' }).success, true);
});

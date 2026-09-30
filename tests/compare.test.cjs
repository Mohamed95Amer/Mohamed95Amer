const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

const { priceCompareListings, rankCompareListings } = createLoader()('src/lib/compare/selection.ts');

function listing(id, vendorId, weight, making, extras = {}) {
  return {
    id, name: `Gold bracelet ${id}`, category: 'bracelet', karat: 18,
    weight_grams: weight, making_charge: making,
    making_charge_discount_percent: 0, making_charge_offer_ends_at: null,
    certificate_fee: 0, stone_value: 0,
    vendor_rate_adjustment_per_gram: 0, assay_fineness: null,
    vat_rate_bps: 500, images: [],
    vendor: { id: vendorId, business_name: `Store ${vendorId}`, emirate: 'Dubai' },
    deliveryFeeAed: 30,
    ...extras,
  };
}

const criteria = {
  category: 'bracelet', karat: 18, minWeight: 5, maxWeight: 7,
  budget: 3000, sort: 'total', fulfilment: 'delivery',
};

test('GetGold Compare returns one best matching piece from each of four shops', () => {
  const listings = [
    listing('a-high', 'a', 5, 300), listing('a-low', 'a', 5, 100),
    listing('b', 'b', 5.5, 120), listing('c', 'c', 6, 70),
    listing('d', 'd', 6.5, 80), listing('e', 'e', 7, 150),
    listing('wrong-category', 'f', 5, 1, { category: 'ring' }),
    listing('wrong-karat', 'g', 5, 1, { karat: 22 }),
    listing('wrong-weight', 'h', 8, 1),
  ];
  const priced = priceCompareListings(listings, 450, 50, criteria);
  const rows = rankCompareListings(priced, 'total');
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((row) => row.listing.vendor.id)).size, 4);
  assert.equal(rows.find((row) => row.listing.vendor.id === 'a').listing.id, 'a-low');
  assert.ok(rows.every((row, index) => index === 0 || rows[index - 1].breakdown.unitPriceAed <= row.breakdown.unitPriceAed));
});

test('making-charge order differs from final-total order and uses discount', () => {
  const listings = [
    listing('lighter', 'a', 5, 220),
    listing('heavier', 'b', 7, 100, { making_charge_discount_percent: 100 }),
  ];
  const priced = priceCompareListings(listings, 450, 50, criteria);
  assert.equal(rankCompareListings(priced, 'total')[0].listing.id, 'lighter');
  assert.equal(rankCompareListings(priced, 'making')[0].listing.id, 'heavier');
  assert.equal(priced.find((row) => row.listing.id === 'heavier').breakdown.makingCharge, 0);
});

test('budget compares full price including store delivery, service fee and VAT', () => {
  const item = listing('boundary', 'a', 5, 100, { deliveryFeeAed: 60 });
  const delivered = priceCompareListings([item], 450, 50, criteria)[0].breakdown;
  const pickup = priceCompareListings([item], 450, 50, { ...criteria, fulfilment: 'pickup' })[0].breakdown;
  assert.equal(delivered.deliveryFee, 60);
  assert.equal(pickup.deliveryFee, 0);
  assert.ok(delivered.unitPriceAed > pickup.unitPriceAed);
  assert.equal(priceCompareListings([item], 450, 50, { ...criteria, budget: pickup.unitPriceAed }).length, 0);
  assert.equal(priceCompareListings([item], 450, 50, { ...criteria, budget: pickup.unitPriceAed, fulfilment: 'pickup' }).length, 1);
});

test('missing quote or malformed price cannot produce a ranked result', () => {
  assert.deepEqual(priceCompareListings([listing('a', 'a', 5, 100)], 0, 50, criteria), []);
  assert.deepEqual(priceCompareListings([listing('bad', 'a', 5, 100, { vat_rate_bps: 999 })], 450, 50, criteria), []);
});

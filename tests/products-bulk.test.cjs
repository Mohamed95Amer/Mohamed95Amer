// Checks for the CSV product importer in src/lib/products/bulk.ts.
//
// Two kinds of case matter here. The first is that a bad file is reported
// precisely — right line, right column — because that is the only thing the
// vendor can act on. The second, and the reason several cases look pedantic,
// is that a mis-read number is not a visible failure: "1,25" read as 125 is a
// ten-times price that lists, sells and is never questioned. So the coercion
// rules are pinned on both sides: what must be accepted, and what must not.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

const { parseBulkProducts, bulkTemplateCsv, BULK_COLUMNS, BULK_MAX_ROWS } =
  createLoader()('src/lib/products/bulk.ts');

const HEADER = 'name,category,karat,weight_grams';
const row = (body) => `${HEADER}\n${body}`;

/** Products from a file expected to be clean. */
function products(csv) {
  const result = parseBulkProducts(csv);
  assert.deepEqual(result.issues, [], 'expected no issues');
  return result.rows.map((r) => r.product);
}
/** Line and column of each issue, where the exact wording is not the point. */
const where = (csv) => parseBulkProducts(csv).issues.map((i) => [i.line, i.column]);
const issues = (csv) => parseBulkProducts(csv).issues.map((i) => [i.line, i.column, i.message]);

test('reads a minimal row and fills the documented defaults', () => {
  assert.deepEqual(products(row('Classic Bangle,bangle,22,12.5')), [{
    name: 'Classic Bangle',
    description: null,
    category: 'bangle',
    karat: 22,
    weight_grams: 12.5,
    quantity: 1,
    making_charge: 0,
    making_charge_discount_percent: 0,
    certificate_fee: 0,
    stone_value: 0,
    certificate_number: null,
    hallmark_info: null,
  }]);
});

test('reads every column', () => {
  assert.deepEqual(products(
    'name,category,karat,weight_grams,quantity,making_charge,' +
    'making_charge_discount_percent,certificate_fee,stone_value,' +
    'certificate_number,hallmark_info,description\n' +
    'Ring A,ring,18,3.250,4,120.50,10,25,80,CERT-1,"750 stamped","A ring, with a comma"',
  ), [{
    name: 'Ring A',
    description: 'A ring, with a comma',
    category: 'ring',
    karat: 18,
    weight_grams: 3.25,
    quantity: 4,
    making_charge: 120.5,
    making_charge_discount_percent: 10,
    certificate_fee: 25,
    stone_value: 80,
    certificate_number: 'CERT-1',
    hallmark_info: '750 stamped',
  }]);
});

test('the template it hands out is a file it accepts', () => {
  // If these two ever disagree, every vendor's first upload fails.
  assert.deepEqual(parseBulkProducts(bulkTemplateCsv()).issues, []);
  assert.equal(bulkTemplateCsv().split('\r\n')[0], BULK_COLUMNS.map((c) => c.key).join(','));
});

test('matches headings as a spreadsheet writes them', () => {
  assert.equal(products('Product Name,Type,Purity,Weight (grams)\nBangle,bangle,22,10').length, 1);
  assert.equal(products(' NAME , category ,KARAT,weight_grams\nRing B,ring,22,1').length, 1);
  assert.equal(products('title,category,carat,grams\nRing B,ring,22,1').length, 1);
});

test('refuses a header it cannot place rather than dropping the column', () => {
  // An unrecognised column is almost always a typo in one that matters.
  assert.deepEqual(where('name,category,karat,weight_grams,weigth\nRing B,ring,22,1,x'), [[1, 'weigth']]);
  assert.deepEqual(where('name,name,category,karat,weight_grams\nRing A,Ring B,ring,22,1'), [[1, 'name']]);
  assert.deepEqual(where('name,category,karat\nRing B,ring,22'), [[1, 'weight_grams']]);
  assert.deepEqual(where('name\nRing B'), [[1, 'category'], [1, 'karat'], [1, 'weight_grams']]);
});

test('reports problems with the file as a whole', () => {
  assert.deepEqual(issues(''), [[null, null, 'The file is empty.']]);
  assert.deepEqual(issues(`${HEADER}\n`), [[null, null, 'The file has a header row but no products.']]);
  assert.deepEqual(issues(`${HEADER}\n\n\n`), [[null, null, 'The file has a header row but no products.']]);
  const atLimit = `${HEADER}\n${Array.from({ length: BULK_MAX_ROWS }, () => 'Ring A,ring,22,1').join('\n')}`;
  assert.deepEqual(parseBulkProducts(atLimit).issues, []);
  const overLimit = `${HEADER}\n${Array.from({ length: BULK_MAX_ROWS + 1 }, () => 'Ring A,ring,22,1').join('\n')}`;
  assert.equal(parseBulkProducts(overLimit).issues.length, 1);
  // The file is unreadable past a stray quote, so its line is all there is to say.
  assert.deepEqual(where(`${HEADER}\nRing A,ring,22,1\n"Ring B,ring,22,1`), [[3, null]]);
});

test('quotes the row number the vendor sees in their spreadsheet', () => {
  assert.deepEqual(where(`${HEADER}\nRing A,ring,22,1\nRing B,ring,99,1`), [[3, 'karat']]);
  // Lines are: 1 header, 2 data, 3 and 4 blank, 5 data.
  assert.deepEqual(where(`${HEADER}\nRing A,ring,22,1\n\n\nRing B,ring,99,1`), [[5, 'karat']]);
  assert.deepEqual(where(
    'name,category,karat,weight_grams,description\nRing A,ring,22,1,"two\nlines"\nRing B,ring,99,1,',
  ), [[4, 'karat']]);
});

test('reports every bad row and every bad column, not just the first', () => {
  assert.deepEqual(where(`${HEADER}\nRing A,ring,99,1\nRing B,ring,22,0\nRing C,nope,22,1`),
    [[2, 'karat'], [3, 'weight_grams'], [4, 'category']]);
  assert.deepEqual(where(row('Ring A,nope,99,abc')),
    [[2, 'category'], [2, 'karat'], [2, 'weight_grams']]);
  // Two length/bound failures in one row take the schema path rather than the
  // coercion path, and must also both be reported.
  assert.deepEqual(where(`name,category,karat,weight_grams,description\nA,ring,22,1,${'x'.repeat(2001)}`),
    [[2, 'name'], [2, 'description']]);
});

test('explains a row whose length does not match the header', () => {
  assert.deepEqual(where(`${HEADER}\nRing A,ring,22`), [[2, null]]);
  assert.deepEqual(where(`${HEADER}\nRing A,ring,22,1,extra`), [[2, null]]);
  assert.equal(products(row('"Ring, large",ring,22,1')).length, 1);
});

test('reads numbers the way a price sheet writes them', () => {
  const weightOf = (value) => products(row(`Ring A,ring,22,${value}`))[0].weight_grams;
  assert.equal(weightOf('12.500'), 12.5);
  assert.equal(weightOf('12'), 12);
  assert.equal(weightOf(' 12.5 '), 12.5);
  assert.equal(weightOf('+12.5'), 12.5);
  assert.equal(products('name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,"1,250.50"')[0].making_charge, 1250.5);
  assert.equal(products('name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,AED 150')[0].making_charge, 150);
});

test('refuses a number it would have to guess at', () => {
  // Stripping every comma would read "1,25" as 125 — an off-by-ten-times
  // price that nothing downstream could detect.
  assert.deepEqual(where('name,category,karat,weight_grams\nRing A,ring,22,"1,25"'), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,heavy')), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,-5')), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,0')), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,')), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,12.5g')), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,1.2.3')), [[2, 'weight_grams']]);
  assert.deepEqual(where(row('Ring A,ring,22,1e3')), [[2, 'weight_grams']]);
});

test('treats a blank optional charge as zero and a mistyped one as an error', () => {
  assert.equal(products('name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,')[0].making_charge, 0);
  assert.deepEqual(where('name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,free'),
    [[2, 'making_charge']]);
  const feeOf = (value) => products(`name,category,karat,weight_grams,certificate_fee\nRing A,ring,22,1,${value}`)[0].certificate_fee;
  assert.equal(feeOf('25.50'), 25.5);
  assert.equal(feeOf(''), 0);
  assert.deepEqual(where('name,category,karat,weight_grams,certificate_fee\nRing A,ring,22,1,free'),
    [[2, 'certificate_fee']]);
});

test('applies the making-charge discount rule the form and database share', () => {
  const withDiscount = (charge, percent) =>
    'name,category,karat,weight_grams,making_charge,making_charge_discount_percent\n' +
    `Ring A,ring,22,1,${charge},${percent}`;
  // A discount off nothing is not a discount.
  assert.deepEqual(where(withDiscount(0, 10)), [[2, 'making_charge_discount_percent']]);
  assert.equal(products(withDiscount(150, 10))[0].making_charge_discount_percent, 10);
  assert.deepEqual(where(withDiscount(150, 120)), [[2, 'making_charge_discount_percent']]);
  assert.deepEqual(where(withDiscount(150, 10.5)), [[2, 'making_charge_discount_percent']]);
});

test('no longer offers vendor_premium, which the product schema fixes at zero', () => {
  assert.deepEqual(where('name,category,karat,weight_grams,vendor_premium\nRing A,ring,22,1,15'),
    [[1, 'vendor_premium']]);
});

test('reads quantity as a whole number, defaulting to one', () => {
  const qtyOf = (value) => products(`name,category,karat,weight_grams,quantity\nRing A,ring,22,1,${value}`)[0].quantity;
  assert.equal(qtyOf('7'), 7);
  assert.equal(qtyOf(''), 1);
  assert.equal(qtyOf('0'), 0);
  assert.deepEqual(where('name,category,karat,weight_grams,quantity\nRing A,ring,22,1,1.5'), [[2, 'quantity']]);
});

test('reads karat the way vendors write it, across the UAE purities', () => {
  const karatOf = (value) => products(row(`Ring A,ring,${value},1`))[0].karat;
  assert.equal(karatOf('22'), 22);
  assert.equal(karatOf('22K'), 22);
  assert.equal(karatOf('18k'), 18);
  assert.equal(karatOf('24 karat'), 24);
  assert.equal(karatOf('14'), 14);
  assert.deepEqual(where(row('Ring A,ring,20,1')), [[2, 'karat']]);
  assert.deepEqual(where(row('Ring A,ring,gold,1')), [[2, 'karat']]);
});

test('reads category forgivingly but never guesses an unknown one', () => {
  const catOf = (value) => products(row(`Ring A,${value},22,1`))[0].category;
  assert.equal(catOf('bangle'), 'bangle');
  assert.equal(catOf('Bangle'), 'bangle');
  assert.equal(catOf('rings'), 'ring');
  assert.equal(catOf('ear ring'), 'earring');
  assert.equal(catOf('ear-ring'), 'earring');
  assert.deepEqual(where(row('Ring A,watch,22,1')), [[2, 'category']]);
  assert.deepEqual(where(row('Ring A,,22,1')), [[2, 'category']]);
});

test('trims text and applies the shared length bounds', () => {
  assert.equal(products(row('  Bangle  ,ring,22,1'))[0].name, 'Bangle');
  assert.deepEqual(where(row('A,ring,22,1')), [[2, 'name']]);
  assert.deepEqual(where(row(`${'A'.repeat(201)},ring,22,1`)), [[2, 'name']]);
  assert.equal(
    products('name,category,karat,weight_grams,certificate_number\nBangle,ring,22,1,')[0].certificate_number,
    null,
  );
  assert.deepEqual(
    where(`name,category,karat,weight_grams,description\nBangle,ring,22,1,${'x'.repeat(2001)}`),
    [[2, 'description']],
  );
});

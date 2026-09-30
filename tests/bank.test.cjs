const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const { validUaeIban, validUaeMobile, normalizeUaeMobile, maskUaeMobile, maskIban, bankSettingsSchema, proofMime } = createLoader()('src/lib/payments/bank.ts');
test('bank settings enforce UAE IBAN checksum and beneficiary when enabled', () => {
  assert.equal(validUaeIban('AE070331234567890123456'), true);
  assert.equal(validUaeIban('AE070331234567890123457'), false);
  assert.equal(bankSettingsSchema.safeParse({ bank_transfer_enabled: true, bank_name: 'Bank', beneficiary_name: 'Store', iban: 'AE07 0331 2345 6789 0123 456' }).success, true);
  assert.equal(bankSettingsSchema.safeParse({ bank_transfer_enabled: true, bank_name: '', beneficiary_name: '', iban: '' }).success, false);
});
test('Aani accepts only normalized UAE mobile numbers', () => {
  assert.equal(normalizeUaeMobile('050 908 1312'), '+971509081312');
  assert.equal(validUaeMobile('050 908 1312'), true);
  assert.equal(validUaeMobile('+971409081312'), false);
  assert.equal(bankSettingsSchema.safeParse({ aani_enabled: true, aani_mobile: '050 908 1312', bank_transfer_enabled: false, bank_name: '', beneficiary_name: '', iban: '' }).success, true);
  assert.equal(bankSettingsSchema.safeParse({ aani_enabled: true, aani_mobile: '123', bank_transfer_enabled: false, bank_name: '', beneficiary_name: '', iban: '' }).success, false);
});
test('payment destinations are masked for logs and default admin display', () => {
  assert.equal(maskUaeMobile('050 908 1312'), '+971509•••312');
  assert.equal(maskIban('AE070331234567890123456'), 'AE0703 •••• •••• •••• 3456');
  assert.equal(maskIban('not-an-iban'), 'Not set');
});
test('transfer proof rejects HTML and unknown content regardless of extension', () => {
  assert.equal(proofMime(new TextEncoder().encode('<html>not a receipt</html>')), null);
  assert.equal(proofMime(new TextEncoder().encode('%PDF-1.4\n')), 'application/pdf');
  assert.equal(proofMime(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(proofMime(new Uint8Array([255,216,255])), 'image/jpeg');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const { validUaeIban, bankSettingsSchema, proofMime } = createLoader()('src/lib/payments/bank.ts');
test('bank settings enforce UAE IBAN checksum and beneficiary when enabled', () => {
  assert.equal(validUaeIban('AE070331234567890123456'), true);
  assert.equal(validUaeIban('AE070331234567890123457'), false);
  assert.equal(bankSettingsSchema.safeParse({ bank_transfer_enabled: true, bank_name: 'Bank', beneficiary_name: 'Store', iban: 'AE07 0331 2345 6789 0123 456' }).success, true);
  assert.equal(bankSettingsSchema.safeParse({ bank_transfer_enabled: true, bank_name: '', beneficiary_name: '', iban: '' }).success, false);
});
test('transfer proof rejects HTML and unknown content regardless of extension', () => {
  assert.equal(proofMime(new TextEncoder().encode('<html>not a receipt</html>')), null);
  assert.equal(proofMime(new TextEncoder().encode('%PDF-1.4\n')), 'application/pdf');
  assert.equal(proofMime(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(proofMime(new Uint8Array([255,216,255])), 'image/jpeg');
});

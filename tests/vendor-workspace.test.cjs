const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const { vendorOrderGroup, vendorOrderStatus } = createLoader()('src/lib/vendor-workspace.ts');
const now = Date.parse('2026-09-22T10:00:00Z');
const future = '2026-09-22T10:30:00Z';
const past = '2026-09-22T09:30:00Z';
test('vendor workspace separates unopened requests, customer acceptance and actionable work', () => {
  assert.equal(vendorOrderGroup({ status: 'pending_vendor_confirmation', expires_at: future, vendor_action_available_at: future }, now), 'waiting');
  assert.equal(vendorOrderGroup({ status: 'pending_vendor_confirmation', expires_at: future, vendor_action_available_at: past }, now), 'requests');
  assert.equal(vendorOrderGroup({ status: 'vendor_confirmed', expires_at: future }, now), 'waiting');
  assert.equal(vendorOrderGroup({ status: 'payment_pending', payment_method: 'aani', expires_at: future }, now), 'waiting');
  assert.equal(vendorOrderGroup({ status: 'payment_pending', payment_method: 'cash', expires_at: future }, now), 'payments');
  assert.equal(vendorOrderGroup({ status: 'payment_confirmed', expires_at: future }, now), 'fulfilment');
});
test('expired requests cannot be presented as actionable; payment evidence and fulfilment survive old deadlines', () => {
  for (const status of ['pending_vendor_confirmation', 'vendor_confirmed', 'payment_pending']) {
    assert.equal(vendorOrderStatus({ status, expires_at: past }, now), 'expired');
    assert.equal(vendorOrderGroup({ status, expires_at: past }, now), 'history');
  }
  assert.equal(vendorOrderGroup({ status: 'payment_verification', expires_at: past, payment_method: 'aani' }, now), 'payments');
  assert.equal(vendorOrderStatus({ status: 'payment_confirmed', expires_at: past }, now), 'payment_confirmed');
  assert.equal(vendorOrderGroup({ status: 'out_for_delivery', expires_at: past }, now), 'fulfilment');
  assert.equal(vendorOrderGroup({ status: 'completed', expires_at: future }, now), 'history');
});

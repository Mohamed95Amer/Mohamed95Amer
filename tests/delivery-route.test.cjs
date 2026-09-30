const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const assignmentId = '11111111-1111-4111-8111-111111111111';

function harness({ status = 'offered', changed = true, assigned = true, approved = true } = {}) {
  const writes = [];
  const notifications = [];
  const audits = [];
  const filters = [];
  const admin = { from(table) {
    let update = false;
    return {
      select() { return this; },
      eq(name, value) { if (update) filters.push([name, value]); return this; },
      update(value) { update = true; writes.push(value); return this; },
      async maybeSingle() {
        if (update) return { data: changed ? { id: assignmentId } : null, error: null };
        if (table === 'delivery_companies') return { data: { id: 'courier-1', company_name: 'Synthetic courier', verification_status: approved ? 'approved' : 'pending', license_expiry_date: '2099-12-31' } };
        return { data: assigned ? { id: assignmentId, status, reservation_id: 'order-1', reservation: { customer_user_id: 'customer-1', vendor: { owner_user_id: 'vendor-1' } } } : null };
      },
    };
  } };
  const route = createLoader({
    '@/lib/supabase/server': {
      getServiceSupabase: () => admin,
      getServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'courier-owner' } } }) } }),
    },
    '@/lib/notifications/server': { notifyUser: async (value) => notifications.push(value) },
    '@/lib/audit': { logAudit: async (value) => audits.push(value) },
    '@/lib/security/rate-limit': { ipFromRequest: () => null },
  })('src/app/api/delivery/assignments/route.ts');
  return { writes, notifications, audits, filters, post: (next, extra = {}) => route.POST(new Request('http://localhost/api/delivery/assignments', { method: 'POST', body: JSON.stringify({ assignmentId, status: next, ...extra }) })) };
}

test('successful courier action checks ownership and previous status before notifications', async () => {
  const h = harness();
  assert.equal((await h.post('accepted')).status, 200);
  assert.deepEqual(h.filters, [['id', assignmentId], ['delivery_company_id', 'courier-1'], ['status', 'offered']]);
  assert.equal(h.writes[0].status, 'accepted');
  assert.ok(h.writes[0].accepted_at);
  assert.equal(h.notifications.length, 2);
  assert.equal(h.audits.length, 1);
});
test('a concurrent update causes a conflict and no false notification or audit', async () => {
  const h = harness({ changed: false });
  assert.equal((await h.post('accepted')).status, 409);
  assert.equal(h.notifications.length, 0);
  assert.equal(h.audits.length, 0);
});
test('unapproved or unassigned couriers cannot update a delivery', async () => {
  for (const [options, status] of [[{ approved: false }, 403], [{ assigned: false }, 404]]) {
    const h = harness(options);
    assert.equal((await h.post('accepted')).status, status);
    assert.equal(h.writes.length, 0);
  }
});
test('cannot skip to delivered or finish without proof', async () => {
  const invalidTransition = harness();
  assert.equal((await invalidTransition.post('delivered', { proofReference: 'POD-TEST' })).status, 409);
  assert.equal(invalidTransition.writes.length, 0);
  const missingProof = harness({ status: 'out_for_delivery' });
  assert.equal((await missingProof.post('delivered')).status, 400);
  assert.equal(missingProof.writes.length, 0);
});
test('proof and completed timestamp persist on a valid completion', async () => {
  const h = harness({ status: 'out_for_delivery' });
  assert.equal((await h.post('delivered', { proofReference: 'POD-TEST', publicNote: 'Delivered' })).status, 200);
  assert.equal(h.writes[0].proof_reference, 'POD-TEST');
  assert.equal(h.writes[0].public_note, 'Delivered');
  assert.ok(h.writes[0].delivered_at);
});

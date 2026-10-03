const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const { vendorRequestTiming } = createLoader()('src/lib/vendors/working-hours.ts');

const schedule = Array.from({ length: 7 }, (_, day) => ({ day_of_week: day, is_open: day >= 1 && day <= 5, opens_at: '09:00', closes_at: '18:00' }));

test('requests during Dubai working hours are immediately actionable', () => {
  const timing = vendorRequestTiming(schedule, new Date('2026-09-21T08:00:00.000Z')); // Monday 12:00 UAE
  assert.equal(timing.isOpenNow, true);
  assert.equal(timing.availableAt.toISOString(), '2026-09-21T08:00:00.000Z');
});

test('requests outside working hours wait until the next Dubai opening', () => {
  const timing = vendorRequestTiming(schedule, new Date('2026-09-21T18:00:00.000Z')); // Monday 22:00 UAE
  assert.equal(timing.isOpenNow, false);
  assert.equal(timing.availableAt.toISOString(), '2026-09-22T05:00:00.000Z');
});

test('closed weekends roll forward to Monday without requesting payment', () => {
  const timing = vendorRequestTiming(schedule, new Date('2026-09-25T16:00:00.000Z')); // Friday 20:00 UAE
  assert.equal(timing.isOpenNow, false);
  assert.equal(timing.availableAt.toISOString(), '2026-09-28T05:00:00.000Z');
});

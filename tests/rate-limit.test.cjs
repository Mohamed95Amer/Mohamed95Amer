const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createLoader } = require('./load-ts.cjs');

test('distributed limiter safely uses the bounded local fallback without shared credentials', async () => {
  const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
  const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const { distributedRateLimit } = createLoader()('src/lib/security/rate-limit.ts');
    const key = `test:${randomUUID()}`;
    assert.deepEqual(await distributedRateLimit(key, 2, 60_000), { ok: true, remaining: 1, source: 'local' });
    assert.deepEqual(await distributedRateLimit(key, 2, 60_000), { ok: true, remaining: 0, source: 'local' });
    assert.deepEqual(await distributedRateLimit(key, 2, 60_000), { ok: false, remaining: 0, source: 'local' });
  } finally {
    if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
    if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
  }
});

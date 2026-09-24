// Opt-in real sandbox API smoke test. Creates synthetic sessions, never uploads PII.
// Run: node --use-system-ca scripts/test-didit-sandbox.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { localRuntime } = require('./local-runtime.cjs');
Object.assign(process.env, localRuntime());
const { createLoader } = require('../tests/load-ts.cjs');
const didit = createLoader()('src/lib/identity/didit.ts');

(async () => {
  assert.ok(didit.diditIsConfigured(), 'Local sandbox credentials required');
  for (const route of ['uae_resident', 'visitor']) {
    const session = await didit.createDiditVerificationSession({ verificationId: randomUUID(), productId: randomUUID(), route });
    console.log(`PASS ${route}: actual session creation and authenticated environment/binding check`);
    for (const [providerStatus, localStatus] of [['Approved', 'approved'], ['Declined', 'rejected'], ['In Review', 'in_review'], ['Expired', 'expired']]) {
      const response = await fetch(`https://verification.didit.me/v3/session/${session.sessionId}/simulate/`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.DIDIT_API_KEY },
        body: JSON.stringify({ new_status: providerStatus, comment: 'Get Gold synthetic API integration validation; no identity media uploaded.' }),
      });
      assert.ok(response.ok, `Sandbox simulation returned HTTP ${response.status}`);
      const decision = await didit.retrieveDiditDecision(session.sessionId);
      assert.equal(didit.mapDiditStatus(decision.status).status, localStatus);
      console.log(`PASS ${route}: provider ${providerStatus} -> local ${localStatus}`);
    }
  }
  console.log('PASS real sandbox API compatibility. Hosted capture and webhook delivery are separate, not covered here.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

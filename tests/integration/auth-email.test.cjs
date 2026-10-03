const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { localRuntime } = require('../../scripts/local-runtime.cjs');

test('local signup confirmation and password recovery via captured email', { timeout: 60000 }, async () => {
  const config = localRuntime();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const client = () => createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, options);
  const email = `getgold-mail-${randomUUID()}@example.invalid`;
  const password = `Test-${randomUUID()}!`;
  const mailbox = 'http://127.0.0.1:54324/api/v1';
  let userId;
  async function verificationLink(subject) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const list = await (await fetch(`${mailbox}/messages`)).json();
      const message = list.messages.find(item => item.Subject.includes(subject) && item.To.some(to => to.Address === email));
      if (message) {
        const detail = await (await fetch(`${mailbox}/message/${message.ID}`)).json();
        const match = detail.HTML.match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/);
        assert.ok(match, 'email contains a verification link');
        const link = new URL(match[1].replaceAll('&amp;', '&'));
        assert.equal(link.origin, 'http://127.0.0.1:54321');
        return link;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Expected ${subject} email in local mail capture`);
  }
  try {
    const signup = await client().auth.signUp({ email, password, options: { emailRedirectTo: 'http://localhost:3000/auth/callback' } });
    assert.equal(signup.error, null, signup.error?.message); userId = signup.data.user.id;
    assert.equal(signup.data.session, null, 'email confirmation must be enabled locally');
    assert.ok((await client().auth.signInWithPassword({ email, password })).error);
    const confirmLink = await verificationLink('Confirm');
    const confirmed = await fetch(confirmLink, { redirect: 'manual' });
    assert.equal(confirmed.status, 303);
    assert.equal((await client().auth.signInWithPassword({ email, password })).error, null);

    const recovery = await client().auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:3000/reset-password' });
    assert.equal(recovery.error, null, recovery.error?.message);
    const resetLink = await verificationLink('Reset');
    const resetResponse = await fetch(resetLink, { redirect: 'manual' });
    assert.equal(resetResponse.status, 303);
    const redirect = new URL(resetResponse.headers.get('location'));
    assert.equal(redirect.origin, 'http://localhost:3000');
    const tokens = new URLSearchParams(redirect.hash.slice(1));
    const resetClient = client();
    assert.equal((await resetClient.auth.setSession({ access_token: tokens.get('access_token'), refresh_token: tokens.get('refresh_token') })).error, null);
    const newPassword = `Test-${randomUUID()}!`;
    assert.equal((await resetClient.auth.updateUser({ password: newPassword })).error, null);
    assert.ok((await client().auth.signInWithPassword({ email, password })).error);
    assert.equal((await client().auth.signInWithPassword({ email, password: newPassword })).error, null);
  } finally {
    if (userId) assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
  }
});

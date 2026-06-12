// ── Odoo CSM Copilot — isolated regression test harness ─────────────────────
//
// Runtime: JavaScriptCore (`jsc -m test-harness.js`) — this machine has no
// Node.js. jsc has no network stack, so the live-streaming leg is captured
// first by scripts/capture-stream (curl/python) into ./_fixture.mjs; the
// assertions below then push that REAL captured stream through the REAL
// production functions imported from lib/ollama.js.
//
// Verifies:
//   1. isAutomatedNotification() flags Odoobot billing spam (and only spam)
//   2. buildQuickBriefPrompt() ships zero system noise to the model
//   3. parseStreamLine() reconstructs a live qwen3.6 stream line-by-line
//
// Exit contract: prints "EXIT:0" on success, "EXIT:1" on any failure
// (the bash wrapper converts this into a process exit code).

import { buildQuickBriefPrompt, isAutomatedNotification, parseStreamLine } from './lib/ollama.js';
import { STREAM_LINES, EXPECTED_TEXT, STREAM_META } from '../odoo-csm-fixture.mjs';

let failures = 0;
const pass = (msg) => print('PASS: ' + msg);
const fail = (msg) => { failures++; print('FAIL: ' + msg); };

// ── Mock payload mirroring the live Odoo page ────────────────────────────────
const ODOOBOT_SPAM =
  'Automatic payment failed. No email sent this time. Error: The payment ' +
  'provider rejected the request. Your card has insufficient funds.';

const mockOdooData = {
  customerName: 'KAYAN & MAKAN CONTRACTING COMPANY',
  subscriptionPlan: 'Yearly Plan',
  recurringAmount: '617.50',
  currency: 'USD',
  dbInfo: { regularUsers: 2, activeUsersList: [1], utilization: 50 }, // 2 licensed, 1 active
  notesContent: 'Contracting company. Key contact Abdulghafoor.',
  chatHistory: Array.from({ length: 5 }, (_, i) => ({
    author: 'OdooBot',
    date: `2026-06-0${i + 1} 10:00:00`,
    body: ODOOBOT_SPAM,
    type: 'message'
  }))
};

const humanMsg = {
  author: 'Mostafa Hassan (mosh)',
  date: '2026-06-02 11:56:00',
  body: 'Call done: discussed renewal with Abdulghafoor, finalizing this week.',
  type: 'log_note'
};

// ── Test 1: the filter itself ────────────────────────────────────────────────
const flagged = mockOdooData.chatHistory.filter(isAutomatedNotification).length;
if (flagged === 5) pass('isAutomatedNotification flags all 5 Odoobot payment messages (5/5)');
else fail(`isAutomatedNotification flagged only ${flagged}/5 spam messages`);

if (!isAutomatedNotification(humanMsg)) pass('human log note is NOT flagged — filter is selective');
else fail('filter wrongly flags a legitimate human message');

// ── Test 2: buildQuickBriefPrompt scrubs the noise end-to-end ───────────────
const NOISE_MARKERS = ['Automatic payment failed', 'insufficient funds', 'payment provider rejected'];

const promptSpamOnly = buildQuickBriefPrompt(mockOdooData, { activeProjects: [] });
const leaked = NOISE_MARKERS.filter(s => promptSpamOnly.includes(s));
if (leaked.length === 0) pass('Quick Brief prompt successfully cleared of system noise');
else fail('system noise leaked into Quick Brief prompt: ' + leaked.join(' | '));

if (promptSpamOnly.includes('(no chatter)')) pass('all-spam history collapses to "(no chatter)" placeholder');
else fail('expected "(no chatter)" placeholder when every message is spam');

if (promptSpamOnly.includes('KAYAN & MAKAN CONTRACTING COMPANY')) pass('customer name present in prompt');
else fail('customer name missing from prompt');

// Mixed history: the human message must survive while spam is still scrubbed
const promptMixed = buildQuickBriefPrompt(
  { ...mockOdooData, chatHistory: [humanMsg, ...mockOdooData.chatHistory] },
  { activeProjects: [] }
);
const mixedLeaked = NOISE_MARKERS.filter(s => promptMixed.includes(s));
if (promptMixed.includes('finalizing this week') && mixedLeaked.length === 0) {
  pass('human signal survives while 5 spam rows are scrubbed (mixed history)');
} else {
  fail(`mixed history broken — human present: ${promptMixed.includes('finalizing this week')}, noise leaked: ${mixedLeaked.length}`);
}

// ── Test 3: live stream fixture parsed line-by-line by the production parser ─
if (!STREAM_LINES.length) {
  fail('no stream fixture captured — server was unreachable during the capture step');
} else {
  let full = '';
  let deltaLines = 0;
  for (const raw of STREAM_LINES) {
    const delta = parseStreamLine(raw);
    if (delta) { full += delta; deltaLines++; }
  }
  if (full.length > 0 && full === EXPECTED_TEXT) {
    pass(`stream parsed line-by-line: ${deltaLines} delta lines → ${full.length} chars ` +
         `(model ${STREAM_META.model}, first token ${STREAM_META.firstTokenMs}ms, total ${STREAM_META.totalMs}ms)`);
  } else {
    fail(`stream reconstruction mismatch — parsed ${full.length} chars, capture client saw ${EXPECTED_TEXT.length}`);
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────
print(failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`);
print('EXIT:' + (failures ? 1 : 0));

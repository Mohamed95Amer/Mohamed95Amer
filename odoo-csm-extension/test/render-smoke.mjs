// Render smoke test — boots the side panel into the REVIEW screen with a stubbed
// chrome.* and asserts the v1.4 UI paints (activity cards, draft buttons,
// editable notes, feedback toggles + aria, coverage chips incl. the read-failed
// state, grounding badges) without throwing. Catches template/render bugs that
// unit tests can't (they only cover logic).
//
// Self-contained: starts its own static server. Requires puppeteer — if it's not
// installed this SKIPS (exit 0) so it never blocks CI that has no browser.
// Run locally:  npm i -D puppeteer && npm run smoke
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let puppeteer;
try { ({ default: puppeteer } = await import('puppeteer')); }
catch { console.log('SKIP: puppeteer not installed (npm i -D puppeteer to enable the render smoke test)'); process.exit(0); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = join(root, decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const errs = [];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  // Ignore network-level noise (favicon/resource 404s) — real app faults arrive
  // as pageerror or an app-emitted console.error, not "Failed to load resource".
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  await page.evaluateOnNewDocument(() => {
    const saved = {
      odooData: { customerName: 'KAYAN', soNumber: 'S123', soId: '123', partnerId: 4242, currency: 'USD',
        pageUrl: 'https://x.odoo.com/odoo/123', chatHistory: [{ author: 'A', date: '2026-06-01', body: 'hi there' }] },
      researchData: { partnerIntel: null, collectorErrors: [] },
      companyProfile: { industry: 'Contracting', summary: 'x' },
      planText: '## Recommended Activities\n### Activity 1: Phone Call — Renewal call',
      activities: [
        { activityType: 'Phone Call', summary: 'Renewal call', dueDate: '2026-06-22', with: 'Ahmed', notes: '- Ask: confirm\n- Reference: "x"' },
        { activityType: 'Email', summary: 'Send recap', dueDate: '2026-06-24', notes: '- Ask: recap' }
      ],
      referenceChecks: [{ verified: true }, { verified: false, reference: 'made up' }],
      coverage: { notes: true, chatter: true, salesHistory: false, utilization: true, invoices: 'error', contacts: 'error', tickets: false, mrrTrend: false, website: false, deepIntel: false },
      generatedAt: Date.now(), memoryKey: 'p4242'
    };
    const respond = (msg, cb) => {
      if (typeof cb !== 'function') return;
      if (msg.type === 'GET_SESSION') return cb({ success: true, data: saved });
      if (msg.type === 'CHECK_OLLAMA') return cb({ success: true, data: { available: true, models: ['qwen3.6:latest'] } });
      cb({ success: true, data: {} });
    };
    globalThis.chrome = {
      runtime: { sendMessage: (m, cb) => respond(m, cb), onMessage: { addListener: () => {} },
        connect: () => ({ onDisconnect: { addListener: () => {} }, postMessage() {} }),
        getManifest: () => ({ version: 'test' }), getURL: p => p, lastError: null },
      storage: { sync: { get: (k, cb) => cb && cb({}), set: () => {} }, local: { get: async () => ({}), set: async () => {} }, session: { get: async () => ({}), set: async () => {} } },
      tabs: { query: (q, cb) => cb ? cb([{ id: 1, url: 'https://x.odoo.com/odoo/123' }]) : Promise.resolve([{ id: 1, url: 'https://x.odoo.com/odoo/123' }]), create: () => {} },
      permissions: { contains: async () => true, request: async () => true }
    };
  });

  await page.goto(`http://localhost:${port}/sidepanel/index.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const ui = await page.evaluate(() => ({
    cards: document.querySelectorAll('.activity-card').length,
    drafts: document.querySelectorAll('.draft-msg-btn').length,
    notes: document.querySelectorAll('.activity-notes-edit').length,
    aria: document.querySelectorAll('[aria-pressed]').length,
    chips: document.querySelectorAll('.coverage-chips .chip').length,
    errChip: !!document.querySelector('.chip-cov-err'),
    refOk: !!document.querySelector('.ref-ok'),
    refBad: !!document.querySelector('.ref-bad')
  }));

  const checks = [
    [ui.cards === 2, 'two activity cards render'],
    [ui.drafts === 2, 'draft buttons present'],
    [ui.notes === 2, 'notes are editable textareas'],
    [ui.aria === 4, 'feedback toggles expose aria-pressed'],
    [ui.chips === 10, 'coverage chips render'],
    [ui.errChip, 'read-failed coverage chip distinct from absent'],
    [ui.refOk && ui.refBad, 'reference grounding badges (ok + bad)']
  ];
  let failed = 0;
  for (const [ok, msg] of checks) { console.log((ok ? 'PASS: ' : 'FAIL: ') + msg); if (!ok) failed++; }
  if (errs.length) { failed++; console.log('FAIL: console/page errors: ' + JSON.stringify(errs)); }
  console.log(failed ? `\n${failed} RENDER CHECK(S) FAILED` : '\nALL RENDER CHECKS PASSED');
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser?.close();
  server.close();
}

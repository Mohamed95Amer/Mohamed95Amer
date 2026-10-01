import {
  ollamaAvailable,
  ollamaChat,
  ollamaModels,
  prewarmModel,
  buildResearchPrompt,
  buildActionPlanPrompt,
  buildPortfolioPrompt,
  buildQuickBriefPrompt,
  buildKeySignals,
  parseActivitiesFromPlan,
  verifyActivityReferences,
  computeDataCoverage,
  chunkProfiles,
  computePortfolioStats,
  extractJsonObject,
  buildDraftMessagePrompt,
  RESEARCH_SYSTEM_PROMPT,
  ACTION_PLAN_SYSTEM_PROMPT,
  PORTFOLIO_SYSTEM_PROMPT,
  QUICK_BRIEF_SYSTEM_PROMPT,
  DRAFT_MESSAGE_SYSTEM_PROMPT
} from '../lib/ollama.js';
import {
  getSettings, saveSettings, getSessionState, saveSessionState, clearSessionState,
  savePortfolioResult, getPortfolioResult
} from '../lib/storage.js';
import {
  partnerKeyFor, getAccountMemory, recordReview, setLatestFeedback,
  buildMemoryBlock, buildLikedExamplesBlock, recordOutcomes, getLastCreatedReview
} from '../lib/memory.js';
import { rescheduleOverdueActivities } from '../lib/reschedule.js';
import { logInfo, logWarn, logError, getDiagnostics, clearDiagnostics } from '../lib/log.js';

// ── SW self-keepalive ────────────────────────────────────────────────────────
// The panel's 20s ping only works while the panel is open, and an idle Port or
// a streaming fetch does NOT reset Chrome's 30s idle timer. While any long
// operation is in flight, ping a trivial chrome.* API ourselves so minutes of
// LLM work survive a closed panel.
let _busyCount = 0;
let _selfKeepalive = null;
function beginLongWork() {
  _busyCount++;
  if (!_selfKeepalive) {
    _selfKeepalive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  }
}
function endLongWork() {
  _busyCount = Math.max(0, _busyCount - 1);
  if (_busyCount === 0 && _selfKeepalive) { clearInterval(_selfKeepalive); _selfKeepalive = null; }
}

// ── Ollama Origin fix ────────────────────────────────────────────────────────
// Ollama rejects requests whose Origin isn't in its allowlist (403). Chrome
// always attaches "Origin: chrome-extension://…" to the service worker's
// fetches, so we strip the header on requests to the Ollama host. curl works
// without this because it sends no Origin — which is why IT's test passed.
// (The server-side alternative is OLLAMA_ORIGINS=chrome-extension://*.)

const OLLAMA_DNR_RULE_ID = 1001;

async function configureOllamaOriginRule() {
  try {
    const { ollamaUrl } = await getSettings();
    const host = new URL(ollamaUrl).hostname; // e.g. 10.100.255.200
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_DNR_RULE_ID],
      addRules: [{
        id: OLLAMA_DNR_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'origin', operation: 'remove' }]
        },
        condition: {
          urlFilter: `||${host}`,
          resourceTypes: ['xmlhttprequest']
        }
      }]
    });
  } catch { /* rule registration is best-effort; health check will surface failures */ }
}

configureOllamaOriginRule(); // every service-worker wake — covers updates & browser restarts

// ── Port keepalive — prevents MV3 SW from being killed during long Ollama requests ──
// Chrome kills idle SWs after 30s but keeps them alive while a Port is open.
const activePorts = new Set();
chrome.runtime.onConnect.addListener(port => {
  activePorts.add(port);
  port.onDisconnect.addListener(() => activePorts.delete(port));
});

// ── Google search tab orchestration ─────────────────────────────────────────

let googleTab = { id: null, resolver: null, timer: null };

function googleResolve(payload) {
  if (googleTab.timer) { clearTimeout(googleTab.timer); googleTab.timer = null; }
  if (googleTab.resolver) { googleTab.resolver(payload); googleTab.resolver = null; }
  if (googleTab.id !== null) { chrome.tabs.remove(googleTab.id).catch(() => {}); googleTab.id = null; }
}


async function fetchCompanyWebsite(companyName) {
  const q = encodeURIComponent(companyName + ' official website');
  const searchUrl = `https://www.google.com/search?q=${q}&hl=en&num=5`;
  const tab = await chrome.tabs.create({ url: searchUrl, active: false });
  googleTab.id = tab.id;

  const result = await new Promise(resolve => {
    googleTab.resolver = resolve;
    googleTab.timer = setTimeout(() => {
      googleTab.timer = null;
      if (googleTab.resolver) { googleTab.resolver({ url: null }); googleTab.resolver = null; }
      if (googleTab.id !== null) { chrome.tabs.remove(googleTab.id).catch(() => {}); googleTab.id = null; }
    }, 10000);

    // The extractor is injected ONLY into this extension-created tab.
    // (It used to be a manifest content_script running — and waking the
    // service worker — on every Google search the user ever made.)
    waitForTabLoad(tab.id, 8000).then(() =>
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/google-extractor.js'] })
    ).catch(() => {
      if (googleTab.resolver) { googleTab.resolver({ url: null }); googleTab.resolver = null; }
    });
  });

  return result.url || null;
}

// SERP results are attacker-influenced — never let them point the browser at
// intranet/loopback hosts (SSRF via search result).
function isPublicHttpUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || !h.includes('.')) return false;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(h)) return false;
    if (/\.(local|internal|lan|corp|intranet)$/i.test(h)) return false;
    return true;
  } catch { return false; }
}

async function fetchCompanyWebsiteContent(url) {
  if (!url || !isPublicHttpUrl(url)) return '';

  // Fast path: a plain fetch covers most marketing sites without spinning up a
  // rendered tab (saves ~8-10s). Tab fallback handles JS-rendered pages.
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), credentials: 'omit' });
    if (res.ok && /text\/html/i.test(res.headers.get('content-type') || '')) {
      const html = await res.text();
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
      const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || '';
      const bodyText = html
        .replace(/<(script|style|noscript|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 3000);
      if (bodyText.length > 300) return `Title: ${title}\nDescription: ${metaDesc}\n\n${bodyText}`;
    }
  } catch { /* fall through to the rendered-tab path */ }

  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabLoad(tab.id, 8000);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const title = document.title || '';
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        // Remove nav, footer, scripts, styles from body clone
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('nav, footer, header, script, style, noscript, aside, .nav, .menu, .footer, .header').forEach(el => el.remove());
        const bodyText = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
        return `Title: ${title}\nDescription: ${metaDesc}\n\n${bodyText}`;
      }
    });
    await chrome.tabs.remove(tab.id).catch(() => {});
    return results?.[0]?.result || '';
  } catch {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    return '';
  }
}


// ── Broadcast to side panel ──────────────────────────────────────────────────

async function broadcast(type, payload) {
  try { await chrome.runtime.sendMessage({ type, payload }); } catch {}
}

// ── Extraction (inlined function — no dependency on content script timing) ───

async function extractOdooPageData() {
  function getPartnerName() {
    const field = document.querySelector('div[name="partner_id"]');
    if (!field) return '';
    const link = field.querySelector('a.o_form_uri, a');
    if (link?.innerText?.trim()) return link.innerText.trim();
    const input = field.querySelector('input');
    if (input?.value?.trim()) return input.value.trim();
    return (field.innerText || '').split('\n')[0].trim();
  }

  function txt(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      const t = (el?.innerText || el?.textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  function extractMessages() {
    const history = [];
    const sets = [
      ['.o-mail-Message', '.o-mail-Message-author', '.o-mail-Message-date', '.o-mail-Message-body'],
      ['.o_Message', '.o_Message_author', '.o_Message_date', '.o_Message_content'],
      ['.o_thread_message', '.o_mail_info strong', '.o_mail_info .o_mail_timestamp', '.o_mail_body']
    ];
    for (const [msgSel, authorSel, dateSel, bodySel] of sets) {
      const msgs = document.querySelectorAll(msgSel);
      if (!msgs.length) continue;
      msgs.forEach(msg => {
        const author = (msg.querySelector(authorSel)?.innerText || '').trim();
        const date = (msg.querySelector(dateSel)?.innerText || msg.querySelector('time')?.getAttribute('datetime') || '').trim();
        const body = (msg.querySelector(bodySel)?.innerText || '').trim().slice(0, 600);
        if (body) history.push({ author, date, body });
      });
      break;
    }
    return history;
  }

  const customerName = getPartnerName();
  const subscriptionPlan = txt(['div[name="recurrence_id"] span', 'div[name="recurrence_id"]']);
  const recurringAmount = txt(['div[name="recurring_monthly"] .o_field_monetary span', 'div[name="recurring_monthly"]']);
  const currencyEl = document.querySelector('div[name="recurring_monthly"] .o_field_monetary .o_currency_symbol');
  const currency = (currencyEl?.textContent || '').trim() || 'USD';
  const soNumber = txt(['.o_field_widget[name="name"]', 'h1.o_form_title', '.o_form_title']);

  const userField = document.querySelector('div[name="user_id"]');
  const assignedSalesperson = (userField?.querySelector('a.o_form_uri, a')?.innerText || userField?.querySelector('input')?.value || '').trim();

  let soId = '';
  const hp = new URLSearchParams(window.location.hash.replace('#', ''));
  if (hp.get('id')) { soId = hp.get('id'); }
  else { const m = window.location.pathname.match(/\/(\d+)\/?$/); if (m) soId = m[1]; }

  const products = [];
  document.querySelectorAll('.o_field_one2many[name="order_line"] .o_data_row').forEach(row => {
    const name = (row.querySelector('td[name="product_id"]')?.innerText || '').trim();
    const qty = (row.querySelector('td[name="product_uom_qty"]')?.innerText || '').trim();
    const price = (row.querySelector('td[name="price_unit"]')?.innerText || '').trim();
    if (name) products.push({ name, qty, unitPrice: price });
  });

  // Click Notes tab first — Odoo renders internal_note_display only after tab activation.
  // Poll for the field instead of a fixed sleep (usually renders in <150ms).
  const notesTab = [...document.querySelectorAll('.o_notebook .nav-link, .nav-tabs .nav-link')]
    .find(t => /^notes?$/i.test(t.textContent.trim()));
  if (notesTab) {
    notesTab.click();
    for (let i = 0; i < 12; i++) {
      if (document.querySelector('div[name="internal_note_display"]')) break;
      await new Promise(r => setTimeout(r, 50));
    }
  }
  // internal_note_display is the CSM internal notes field (visible only after tab click)
  const notesContent = (
    document.querySelector(
      'div[name="internal_note_display"] .odoo-editor-editable, ' +
      'div[name="internal_note_display"] .o_editable, ' +
      'div[name="internal_note_display"]'
    )?.innerText || ''
  ).trim().slice(0, 2000);

  // Sales History smart button — find by text
  const salesHistoryBtn = [...document.querySelectorAll('.o_stat_button, .oe_stat_button')]
    .find(b => /sales?\s*hist/i.test(b.textContent));
  const salesHistoryUrl = salesHistoryBtn?.href || salesHistoryBtn?.querySelector('a')?.href || '';

  // Hosting info
  const hostingEl = document.querySelector('div[name="hosting_id"] a, div[name="hosting_id"] span');
  const hosting = (hostingEl?.innerText || '').trim();

  // Database count from smart button
  const dbBtn = [...document.querySelectorAll('.o_stat_button, .oe_stat_button')]
    .find(b => /database/i.test(b.textContent));
  const dbCount = parseInt(dbBtn?.querySelector('.o_stat_value, .o_field_integer')?.innerText || '0') || 0;

  // Renewal / next invoice date
  const renewalDate = txt([
    'div[name="next_invoice_date"] span',
    'div[name="next_invoice_date"]',
    'div[name="date_end"] span',
    'div[name="date_end"]',
    'div[name="recurring_next_date"] span',
    'div[name="recurring_next_date"]'
  ]);

  // Days until renewal
  let daysUntilRenewal = null;
  if (renewalDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let d = null;

    // Try ISO: YYYY-MM-DD (use local date parts to avoid UTC shift in GMT+3)
    const iso = renewalDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) d = new Date(+iso[1], +iso[2] - 1, +iso[3]);

    // Try DD/MM/YYYY or MM/DD/YYYY with 4-digit year
    if (!d || isNaN(d.getTime())) {
      const dmy = renewalDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    }

    // Odoo shows "Jul 15" (abbreviated month + day, no year) when renewal is in the current year
    if (!d || isNaN(d.getTime())) {
      const parsed = new Date(renewalDate + ' ' + today.getFullYear());
      if (!isNaN(parsed.getTime())) {
        d = parsed;
        // If that date is already in the past, it means next year
        if (d < today) d = new Date(renewalDate + ' ' + (today.getFullYear() + 1));
      }
    }

    if (d && !isNaN(d.getTime())) {
      daysUntilRenewal = Math.round((d - today) / 86400000);
    }
  }

  const data = {
    customerName, subscriptionPlan, recurringAmount, currency, soNumber, soId,
    assignedSalesperson, products, chatHistory: extractMessages(),
    notesContent, salesHistoryUrl, hosting, dbCount,
    renewalDate, daysUntilRenewal,
    pageUrl: window.location.href
  };

  // RPC overlay — read the record directly for exact, version-independent values
  // (ISO dates, real numbers, no rendering races). DOM values stand if RPC fails.
  try {
    const id = parseInt(soId, 10);
    if (id) {
      const rpc = async (model, method, args, kwargs) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
        });
        const j = await r.json();
        return j.result;
      };

      // Header read and order-lines read are independent — fire them together
      const [recs, lines] = await Promise.all([
        rpc('sale.order', 'read',
          [[id], ['name', 'partner_id', 'commercial_partner_id', 'recurrence_id', 'recurring_monthly',
                  'currency_id', 'next_invoice_date', 'end_date', 'user_id', 'subscription_state']], {}),
        rpc('sale.order.line', 'search_read',
          [[['order_id', '=', id], ['display_type', '=', false]]],
          { fields: ['product_id', 'product_uom_qty', 'price_unit'], limit: 30 })
      ]);
      const rec = recs?.[0];
      if (rec) {
        if (rec.partner_id?.[1]) data.customerName = rec.partner_id[1];
        if (rec.name) data.soNumber = rec.name;
        if (rec.recurrence_id?.[1]) data.subscriptionPlan = rec.recurrence_id[1];
        if (rec.recurring_monthly != null) data.recurringAmount = String(rec.recurring_monthly);
        if (rec.currency_id?.[1]) data.currency = rec.currency_id[1];
        if (rec.user_id?.[1]) data.assignedSalesperson = rec.user_id[1];
        if (rec.subscription_state) data.subscriptionState = String(rec.subscription_state).replace(/^\d+_/, '');
        // Resolved once here, passed to every collector — replaces 4 duplicate
        // partner-lookup round-trips downstream
        data.partnerId = rec.commercial_partner_id?.[0] || rec.partner_id?.[0] || null;

        // end_date = the contract decision point; next_invoice_date = next
        // billing cycle. Keep both — monthly invoicing is not a "renewal".
        data.nextInvoiceDate = rec.next_invoice_date || null;
        data.contractEndDate = rec.end_date || null;
        const isoRenewal = rec.end_date || rec.next_invoice_date;
        if (isoRenewal) {
          data.renewalDate = isoRenewal;
          const parts = isoRenewal.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (parts) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const d = new Date(+parts[1], +parts[2] - 1, +parts[3]);
            data.daysUntilRenewal = Math.round((d - today) / 86400000);
          }
        }

        if (Array.isArray(lines) && lines.length) {
          data.products = lines
            .filter(l => l.product_id?.[1])
            .map(l => ({ name: l.product_id[1], qty: String(l.product_uom_qty ?? ''), unitPrice: String(l.price_unit ?? '') }));
        }
      }
    }
  } catch { /* DOM extraction stands */ }

  return data;
}

// ── Database utilization (async DOM automation — separate executeScript call) ─

async function extractDbUtilization() {
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function poll(fn, tries, interval) {
    for (let i = 0; i < tries; i++) {
      const v = fn();
      if (v) return v;
      await delay(interval);
    }
    return null;
  }

  // Click "Databases" tab
  const dbTab = await poll(() =>
    [...document.querySelectorAll('.o_notebook .nav-link, .nav-tabs .nav-link, .nav-tabs a')]
      .find(t => /databases?/i.test(t.textContent)),
    6, 400
  );
  if (!dbTab) return { error: 'Databases tab not found' };
  dbTab.click();
  // No fixed sleep — the row poll below waits exactly as long as needed

  // Find first database row
  const dbRow = await poll(() =>
    document.querySelector(
      '.o_field_one2many[name="database_ids"] .o_data_row, ' +
      'div[name="database_ids"] .o_data_row'
    ),
    8, 400
  );
  if (!dbRow) return { error: 'No database rows found in Databases tab' };
  // Click first data cell (not the row itself) to reliably open inline dialog
  const firstCell = dbRow.querySelector('td.o_data_cell');
  (firstCell || dbRow).click();
  await delay(150); // dialog poll below covers the rest

  // Poll for dialog to appear (up to 6s)
  const dialog = await poll(() => {
    const d = document.querySelector('.o_dialog, .modal-dialog .modal-content, .modal-content');
    return d?.querySelector('.nav-link, a[role="tab"]') ? d : null;
  }, 15, 400);
  if (!dialog) return { error: 'Database detail dialog did not open' };

  // Click "Updates" tab
  const updTab = [...dialog.querySelectorAll('.nav-link, a[role="tab"]')]
    .find(t => /updates?/i.test(t.textContent));
  if (!updTab) return { error: 'Updates tab not found in dialog' };
  updTab.click();
  await delay(150); // rows poll below covers the rest

  // Poll for table rows to appear
  const rows = await poll(() => {
    const r = [...dialog.querySelectorAll('.o_data_row, tbody tr:not(.o_group_header)')];
    return r.length > 0 ? r : null;
  }, 8, 400);
  if (!rows) { dialog.querySelector('.btn-close, [aria-label="Close"]')?.click(); return { error: 'No data rows in Updates tab' }; }

  // Detect column indices from header text; fall back to screenshot-based indices (col 1 = Regular, col 2 = Active Regular)
  const headers = [...dialog.querySelectorAll('thead th')].map(h => h.innerText.trim().toLowerCase());
  let regularIdx = headers.findIndex(h => /regular/i.test(h) && !/active/i.test(h));
  let activeIdx = headers.findIndex(h => /active\s*r/i.test(h));
  if (regularIdx === -1) regularIdx = 1;
  if (activeIdx === -1) activeIdx = 2;

  const cells0 = rows[0].querySelectorAll('td');
  const regularUsers = parseInt(cells0[regularIdx]?.innerText || '0') || 0;
  const last5 = rows.slice(0, 5);
  const activeUsersList = last5.map(r => parseInt(r.querySelectorAll('td')[activeIdx]?.innerText || '0') || 0);
  const avg = activeUsersList.reduce((a, b) => a + b, 0) / (activeUsersList.length || 1);
  const utilization = regularUsers > 0 ? Math.round((avg / regularUsers) * 100) : null;

  // Also grab Installed Apps for module adoption analysis
  let installedModules = [];
  const appsTab = [...dialog.querySelectorAll('.nav-link, a[role="tab"]')]
    .find(t => /installed|apps/i.test(t.textContent));
  if (appsTab) {
    appsTab.click();
    const appEls = await poll(() => {
      const els = dialog.querySelectorAll('.o_data_row td:first-child, .o_kanban_record .o_module_name, .o_data_row .o_data_cell:first-child');
      return els.length ? els : null;
    }, 6, 200) || [];
    installedModules = [...appEls].map(el => el.innerText.trim()).filter(Boolean).slice(0, 80);
  }

  // Close dialog
  dialog.querySelector('.btn-close, button[aria-label="Close"], .o_dialog_close')?.click();
  await delay(300);

  return { regularUsers, activeUsersList, utilization, installedModules };
}

async function extractFromOdooTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractOdooPageData });
    const data = results?.[0]?.result;
    if (!data) throw new Error('Could not read page — make sure you are on a Sales Order/Subscription page');
    await saveSessionState(tabId, { odooData: data });
    logInfo('extract.ok', { so: data.soNumber, partner: data.partnerId || null });
    // Kick off DB utilization in background — broadcasts enrichment when done
    extractDbUtilizationFromTab(tabId).catch(() => {});
    // Reconcile what happened to the last review's activities (outcome learning)
    reconcilePriorOutcomes(tabId, data).catch(() => {});
    return { success: true, data };
  } catch (err) {
    logError('extract.fail', { error: err.message });
    return { success: false, error: err.message };
  }
}

// Outcome learning: check whether the activities created in the most recent
// review still exist as open mail.activity records on this SO. Gone = completed
// (Odoo deletes an activity when it's marked done); still present & overdue =
// the CSM didn't act. Stored into account memory and surfaced next analysis.
async function reconcilePriorOutcomes(tabId, odooData) {
  const pKey = partnerKeyFor(odooData);
  if (!pKey) return;
  const last = await getLastCreatedReview(pKey);
  if (!last?.finalActivities?.length) return;

  const soId = parseInt(odooData.soId || '0', 10);
  if (!soId) return;

  let openActs;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      args: [soId],
      func: async (id) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: {
            model: 'mail.activity', method: 'search_read',
            args: [[['res_model', '=', 'sale.order'], ['res_id', '=', id]]],
            kwargs: { fields: ['summary', 'date_deadline'], limit: 50 }
          }})
        });
        const j = await r.json();
        if (j.error) return null;
        return Array.isArray(j.result) ? j.result : [];
      }
    });
    openActs = res?.[0]?.result;
  } catch { openActs = null; }
  if (openActs == null) return; // RPC failed — don't record misleading outcomes

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const openBySummary = new Map(openActs.map(a => [norm(a.summary), a]));
  const todayIso = new Date().toISOString().slice(0, 10);

  const outcomes = last.finalActivities.map(act => {
    const open = openBySummary.get(norm(act.summary));
    if (!open) return { summary: act.summary, state: 'done' };
    const overdue = open.date_deadline && open.date_deadline < todayIso;
    const daysOpen = open.date_deadline
      ? Math.round((Date.now() - new Date(open.date_deadline)) / 86400000) : null;
    return { summary: act.summary, state: overdue ? 'overdue' : 'open', daysOpen: overdue ? daysOpen : null };
  });

  await recordOutcomes(pKey, outcomes);
  logInfo('outcomes.reconciled', {
    done: outcomes.filter(o => o.state === 'done').length,
    overdue: outcomes.filter(o => o.state === 'overdue').length
  });
}

async function extractDbUtilizationFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractDbUtilization
    });
    const dbInfo = results?.[0]?.result;

    // Merge into session state
    const session = await getSessionState(tabId) || {};
    if (session.odooData && dbInfo && !dbInfo.error) {
      session.odooData.dbInfo = dbInfo;
      if (dbInfo.installedModules?.length) session.odooData.installedModules = dbInfo.installedModules;
      await saveSessionState(tabId, session);
    }
    await broadcast('PAGE_DATA_ENRICHED', { dbInfo: dbInfo || null, error: dbInfo?.error || null });
  } catch (err) {
    await broadcast('PAGE_DATA_ENRICHED', { dbInfo: null, error: err.message });
  }
}

// ── Chatter ──────────────────────────────────────────────────────────────────

// One mail.message RPC replaces the old scroll-and-click loop (9-50s of fixed
// sleeps that also mounted the full history into the live page DOM). Returns
// ISO dates, which also fixes the NaN date parsing in buildKeySignals.
async function fetchChatterRpc(tabId, soId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [soId || 0],
      func: async (knownId) => {
        const rpc = async (model, method, args, kwargs) => {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
          });
          const j = await r.json();
          return Array.isArray(j.result) ? j.result : [];
        };
        const id = knownId || parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
        if (!id) return null;

        const msgs = await rpc('mail.message', 'search_read',
          [[['model', '=', 'sale.order'], ['res_id', '=', id],
            ['message_type', 'in', ['comment', 'email']]]],
          { fields: ['author_id', 'date', 'body', 'subtype_id'], limit: 300, order: 'date desc' });

        return msgs.map(m => ({
          author: m.author_id?.[1] || '',
          date: m.date || '',
          body: (m.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
          type: /note/i.test(m.subtype_id?.[1] || '') ? 'log_note' : 'message'
        })).filter(m => m.body);
      }
    });
    return results?.[0]?.result;
  } catch {
    return null;
  }
}

// Legacy fallback only — used when the mail.message RPC fails (e.g. ACL quirk).
async function scrollAndExtractChatter(tabId, deepSearch = false) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [deepSearch],
      func: async (isDeep) => {
        const threadSelectors = ['.o-mail-Thread', '.o_mail_thread', '.oe_chatter .o_mail_thread'];
        let el = null;
        for (const s of threadSelectors) { el = document.querySelector(s); if (el) break; }

        const loadMoreSel = 'button.o-mail-Thread-loadMore, button[aria-label*="older"], .o_mail_thread_load_more, button:not([disabled])[class*="load"]';

        if (el) {
          el.scrollTop = el.scrollHeight;
          await new Promise(r => setTimeout(r, 400));

          // Scroll to top and keep clicking "Load more" until all history is loaded
          // Deep search does more scroll iterations for the outer page; both exhaust chatter
          const iterations = isDeep ? 25 : 15;
          for (let i = 0; i < iterations; i++) {
            el.scrollTop = 0;
            await new Promise(r => setTimeout(r, 600));
            const loadMore = el.querySelector(loadMoreSel) || document.querySelector(loadMoreSel);
            if (loadMore) { loadMore.click(); await new Promise(r => setTimeout(r, 900)); }
          }
          // Keep clicking until no "Load more" remains (exhausts full chatter history)
          for (let extra = 0; extra < 30; extra++) {
            const loadMore = el.querySelector(loadMoreSel) || document.querySelector(loadMoreSel);
            if (!loadMore) break;
            loadMore.click();
            await new Promise(r => setTimeout(r, 900));
          }
        }

        // Extract all messages (includes both regular messages and log notes)
        const sets = [
          ['.o-mail-Message', '.o-mail-Message-author', '.o-mail-Message-date', '.o-mail-Message-body'],
          ['.o_Message', '.o_Message_author', '.o_Message_date', '.o_Message_content'],
          ['.o_thread_message', '.o_mail_info strong', '.o_mail_info .o_mail_timestamp', '.o_mail_body']
        ];
        const history = [];
        for (const [msgSel, authorSel, dateSel, bodySel] of sets) {
          const msgs = document.querySelectorAll(msgSel);
          if (!msgs.length) continue;
          msgs.forEach(msg => {
            const author = (msg.querySelector(authorSel)?.innerText || '').trim();
            const date = (msg.querySelector(dateSel)?.innerText || msg.querySelector('time')?.getAttribute('datetime') || '').trim();
            const body = (msg.querySelector(bodySel)?.innerText || '').trim().slice(0, 600);
            // Mark log notes (internal notes) so AI knows these are CSM-internal
            const isLogNote = msg.classList.contains('o-mail-Message--logNote') ||
              msg.querySelector('.o-mail-Message-logNote, [title*="Log"], [aria-label*="Log"]') !== null;
            if (body) history.push({ author, date, body, type: isLogNote ? 'log_note' : 'message' });
          });
          break;
        }
        return history;
      }
    });
    return results?.[0]?.result || [];
  } catch {
    return [];
  }
}

// ── Sales history ─────────────────────────────────────────────────────────────

async function waitForTabLoad(tabId, timeoutMs = 10000) {
  return new Promise(resolve => {
    const listener = (tid, info) => {
      if (tid === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, timeoutMs);
  });
}

// RPC-based: queries all orders for the customer's company (child_of partner),
// so it works identically whether the customer bought implementation with us,
// self-implemented, or came from a reseller with a broken renewal chain.
// Replaces the old tab-automation approach (5 hidden tabs × ~20s → ~2s total).
async function fetchSalesHistory(tabId, knownPartnerId = 0) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [knownPartnerId || 0],
      func: async (knownPid) => {
        const rpc = async (model, method, args, kwargs) => {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
          });
          const j = await r.json();
          return Array.isArray(j.result) ? j.result : [];
        };

        // Resolve the customer from the order record itself (URL id → RPC) —
        // the partner link isn't reliably present in the DOM across views.
        // commercial_partner_id anchors at company level even when the order
        // is on a child contact.
        const currentId = parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
        let partnerId = knownPid; // resolved once during extraction — no extra round-trip
        if (!partnerId && currentId) {
          const so = await rpc('sale.order', 'read', [[currentId], ['partner_id', 'commercial_partner_id']], {});
          partnerId = so?.[0]?.commercial_partner_id?.[0] || so?.[0]?.partner_id?.[0] || 0;
        }
        if (!partnerId) {
          const link = document.querySelector('div[name="partner_id"] a[data-id], div[name="partner_id"] a');
          partnerId = parseInt(link?.getAttribute('data-id') || link?.getAttribute('href')?.match(/\/(\d+)(?:\?|$)/)?.[1] || '0');
        }
        if (!partnerId) return { orders: [], messages: [] };

        const orders = await rpc('sale.order', 'search_read',
          [[['partner_id', 'child_of', partnerId], ['id', '!=', currentId]]],
          { fields: ['name', 'date_order', 'amount_total', 'state', 'subscription_state', 'user_id'],
            limit: 10, order: 'date_order desc' });
        if (!orders.length) return { orders: [], messages: [] };

        const msgs = await rpc('mail.message', 'search_read',
          [[['model', '=', 'sale.order'], ['res_id', 'in', orders.map(o => o.id)],
            ['message_type', 'in', ['comment', 'email']]]],
          { fields: ['res_id', 'author_id', 'date', 'body'], limit: 200, order: 'date desc' });

        const nameById = Object.fromEntries(orders.map(o => [o.id, o.name]));
        const messages = msgs
          .map(m => ({
            author: m.author_id?.[1] || '',
            date: m.date || '',
            body: (m.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
            type: 'message',
            sourceOrder: nameById[m.res_id] || ''
          }))
          .filter(m => m.body.length > 10);

        return { orders, messages };
      }
    });
    return results?.[0]?.result || { orders: [], messages: [] };
  } catch {
    return { orders: [], messages: [] };
  }
}

// Partner-level "Customer 360" — the data behind the contact form's smart buttons,
// read directly via RPC: CRM opportunities (presales story), invoices (payment
// behavior), and child contacts (departed-champion detection).
async function fetchPartnerIntel(tabId, knownPartnerId = 0) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [knownPartnerId || 0],
      func: async (knownPid) => {
       try {
        const rpc = async (model, method, args, kwargs) => {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
          });
          const j = await r.json();
          // Surface a real RPC failure (ACL, field rename on an Odoo upgrade)
          // distinctly from an empty result so the UI can say "read failed".
          if (j.error) throw new Error(j.error.data?.message || j.error.message || 'RPC error');
          return Array.isArray(j.result) ? j.result : [];
        };

        const soIdFromUrl = parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
        let partnerId = knownPid;
        if (!partnerId && soIdFromUrl) {
          const so = await rpc('sale.order', 'read', [[soIdFromUrl], ['partner_id', 'commercial_partner_id']], {});
          partnerId = so?.[0]?.commercial_partner_id?.[0] || so?.[0]?.partner_id?.[0] || 0;
        }
        if (!partnerId) {
          const link = document.querySelector('div[name="partner_id"] a[data-id], div[name="partner_id"] a');
          partnerId = parseInt(link?.getAttribute('data-id') || link?.getAttribute('href')?.match(/\/(\d+)(?:\?|$)/)?.[1] || '0');
        }
        if (!partnerId) return null;

        // System-of-record signals the playbook references but the model never
        // saw before: open helpdesk tickets + contract-value change events.
        // Both models may be absent on a given database — return null (vs [])
        // so "no data" and "module not installed" stay distinguishable.
        const rpcOrNull = async (model, method, args, kwargs) => {
          try {
            const r = await fetch('/web/dataset/call_kw', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
            });
            const j = await r.json();
            if (j.error) return null;
            return Array.isArray(j.result) ? j.result : null;
          } catch { return null; }
        };
        const ticketsTask = rpcOrNull('helpdesk.ticket', 'search_read',
          [[['partner_id', 'child_of', partnerId], ['stage_id.fold', '=', false]]],
          { fields: ['name', 'create_date', 'priority'], limit: 10, order: 'create_date desc' });
        const orderLogTask = rpcOrNull('sale.order.log', 'search_read',
          [[['order_id.partner_id', 'child_of', partnerId]]],
          { fields: ['event_type', 'event_date', 'amount_signed', 'recurring_monthly'], limit: 12, order: 'event_date desc' });

        const [leads, invoices, contacts] = await Promise.all([
          // '|' active/inactive includes Lost opportunities (archived in Odoo)
          rpc('crm.lead', 'search_read',
            [['|', ['active', '=', true], ['active', '=', false], ['partner_id', 'child_of', partnerId]]],
            { fields: ['name', 'stage_id', 'expected_revenue', 'active', 'create_date'],
              limit: 6, order: 'create_date desc' }),
          rpc('account.move', 'search_read',
            [[['partner_id', 'child_of', partnerId], ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']]],
            { fields: ['name', 'invoice_date', 'invoice_date_due', 'amount_total', 'payment_state'],
              limit: 24, order: 'invoice_date desc' }),
          rpc('res.partner', 'search_read',
            [['|', ['active', '=', true], ['active', '=', false], ['parent_id', '=', partnerId]]],
            { fields: ['name', 'function', 'email', 'active'], limit: 12 })
        ]);
        const [ticketRows, orderLogRows] = await Promise.all([ticketsTask, orderLogTask]);

        const todayIso = new Date().toISOString().slice(0, 10);
        const overdueCount = invoices.filter(i =>
          ['not_paid', 'partial'].includes(i.payment_state) &&
          i.invoice_date_due && i.invoice_date_due < todayIso
        ).length;

        // Departed contact detection: archived records, or "left the company"-style
        // notes CSMs append to the contact name (as seen on real partner records)
        const departed = contacts
          .filter(c => c.active === false || /\bleft\b|former|no longer|departed|resigned/i.test(`${c.name} ${c.function || ''}`))
          .map(c => `${c.name}${c.function ? ` (${c.function})` : ''}`);

        // Open-ticket summary (null = Helpdesk module not readable on this db)
        let tickets = null;
        if (ticketRows !== null) {
          const today = Date.now();
          const ages = ticketRows.map(t => t.create_date ? Math.round((today - new Date(t.create_date)) / 86400000) : null).filter(d => d != null);
          tickets = {
            openCount: ticketRows.length,
            oldestDays: ages.length ? Math.max(...ages) : null,
            recent: ticketRows.slice(0, 3).map(t => (t.name || '').slice(0, 80))
          };
        }

        // Contract-value trend from subscription event log (upsell/downsell/churn)
        let mrrTrend = null;
        if (orderLogRows !== null) {
          mrrTrend = {
            events: orderLogRows.slice(0, 6).map(l => ({
              date: (l.event_date || '').slice(0, 10),
              type: String(l.event_type || '').replace(/^\d+_/, ''),
              delta: l.amount_signed != null ? (l.amount_signed > 0 ? `+${l.amount_signed}` : String(l.amount_signed)) : '?'
            }))
          };
        }

        return {
          opportunities: leads,
          tickets,
          mrrTrend,
          invoices: {
            count: invoices.length,
            overdueCount,
            recent: invoices.slice(0, 6).map(i => ({
              name: i.name, invoice_date: i.invoice_date,
              amount_total: i.amount_total, payment_state: i.payment_state
            }))
          },
          contacts: {
            total: contacts.length,
            departed,
            list: contacts.filter(c => c.active !== false)
              .map(c => ({ name: c.name, function: c.function || '', email: c.email || '' }))
          }
        };
       } catch (e) {
        return { __error: String(e && e.message || e) };  // RPC read failed (vs no data)
       }
      }
    });
    return results?.[0]?.result || null;
  } catch (e) {
    return { __error: String(e && e.message || e) };
  }
}

// ── Deep Intel: Sales History, Tasks, Timesheets via Odoo JSON-RPC ──────────

async function extractDeepIntel(tabId, knownPartnerId = 0) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [knownPartnerId || 0],
      func: async (knownPid) => {
        async function rpc(model, method, domain, fields, limit = 25) {
          try {
            const r = await fetch('/web/dataset/call_kw', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', method: 'call', id: Math.random(),
                params: { model, method, args: [domain], kwargs: { fields, limit, order: 'id desc' } }
              })
            });
            const j = await r.json();
            return Array.isArray(j.result) ? j.result : [];
          } catch { return []; }
        }

        // Resolve partner via RPC from the order id in the URL (DOM link is fallback)
        const urlId = parseInt(window.location.pathname.match(/\/(\d+)$/)?.[1] || '0');
        let partnerId = knownPid;
        if (!partnerId && urlId) {
          try {
            const resp = await fetch('/web/dataset/call_kw', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(),
                params: { model: 'sale.order', method: 'read', args: [[urlId], ['partner_id', 'commercial_partner_id']], kwargs: {} } })
            });
            const so = (await resp.json())?.result?.[0];
            partnerId = so?.commercial_partner_id?.[0] || so?.partner_id?.[0] || 0;
          } catch { /* fall through to DOM */ }
        }
        if (!partnerId) {
          const link = document.querySelector('div[name="partner_id"] a[data-id], div[name="partner_id"] a');
          partnerId = parseInt(link?.getAttribute('data-id') || (link?.getAttribute('href') || '').match(/\/(\d+)(?:\?|$)/)?.[1] || '0');
        }
        if (!partnerId) return null;

        const [orders, tasks, timesheets] = await Promise.all([
          rpc('sale.order', 'search_read',
            [['partner_id', 'child_of', partnerId], ['id', '!=', urlId], ['state', 'in', ['sale', 'done', 'cancel']]],
            ['name', 'date_order', 'amount_total', 'state', 'subscription_state'], 10),
          rpc('project.task', 'search_read',
            [['partner_id', 'child_of', partnerId]],
            ['name', 'stage_id', 'date_deadline', 'kanban_state', 'description'], 20),
          rpc('account.analytic.line', 'search_read',
            [['partner_id', 'child_of', partnerId], ['unit_amount', '>', 0]],
            ['date', 'employee_id', 'unit_amount', 'name', 'project_id'], 100)
        ]);

        // Summarise timesheets
        const totalHours = timesheets.reduce((s, t) => s + (t.unit_amount || 0), 0);
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
        let last30h = 0;
        const byPerson = {};
        for (const t of timesheets) {
          const name = t.employee_id?.[1] || 'Unknown';
          byPerson[name] = (byPerson[name] || 0) + (t.unit_amount || 0);
          if (new Date(t.date) >= cutoff) last30h += t.unit_amount || 0;
        }
        const topContributors = Object.entries(byPerson)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([n, h]) => `${n}: ${h.toFixed(1)}h`);

        return {
          salesOrders: orders,
          tasks,
          timesheets: {
            totalHours: parseFloat(totalHours.toFixed(1)),
            last30Hours: parseFloat(last30h.toFixed(1)),
            topContributors,
            recentEntries: timesheets.slice(0, 8).map(t => ({
              date: t.date,
              employee: t.employee_id?.[1],
              hours: t.unit_amount,
              description: (t.name || '').slice(0, 100),
              project: t.project_id?.[1]
            }))
          }
        };
      }
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

// ── Research phase ───────────────────────────────────────────────────────────

// Lightweight project info — runs always (cheap RPC, doesn't require deep search).
// Returns active projects + hours remaining so the Quick Brief can show "Has a project? Yes — 125h / 1h remaining"
async function fetchProjectInfo(tabId, knownPartnerId = 0) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [knownPartnerId || 0],
      func: async (knownPid) => {
        const rpc = (model, method, args, kwargs) => fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
        }).then(r => r.json()).then(d => Array.isArray(d.result) ? d.result : []);

        const soId = parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
        let partnerId = knownPid;
        if (!partnerId && soId) {
          const so = await rpc('sale.order', 'read', [[soId], ['partner_id', 'commercial_partner_id']], {});
          partnerId = so?.[0]?.commercial_partner_id?.[0] || so?.[0]?.partner_id?.[0] || 0;
        }
        if (!partnerId) {
          const link = document.querySelector('div[name="partner_id"] a[data-id], div[name="partner_id"] a');
          partnerId = parseInt(link?.getAttribute('data-id') || link?.getAttribute('href')?.match(/\/(\d+)(?:\?|$)/)?.[1] || '0');
        }
        if (!partnerId) return { activeProjects: [] };

        // Get projects for this partner (active stage only)
        const projects = await rpc('project.project', 'search_read',
          [[['partner_id', 'child_of', partnerId], ['active', '=', true]]],
          { fields: ['id', 'name', 'allocated_hours', 'effective_hours', 'stage_id'], limit: 10 }
        );
        if (!projects.length) return { activeProjects: [] };

        return {
          activeProjects: projects.map(p => {
            const logged = p.effective_hours || 0;
            const allocated = p.allocated_hours || 0;
            const remaining = allocated > 0 ? +(allocated - logged).toFixed(1) : null;
            return {
              name: p.name,
              hoursAllocated: allocated,
              hoursLogged: +logged.toFixed(1),
              hoursRemaining: remaining,
              stage: p.stage_id?.[1] || ''
            };
          })
        };
      }
    });
    return results?.[0]?.result || { activeProjects: [] };
  } catch {
    return { activeProjects: [] };
  }
}

async function runQuickBrief({ tabId }) {
  beginLongWork();
  try {
    broadcast('QUICK_BRIEF_PROGRESS', { status: 'running' });

    const session = await getSessionState(tabId) || {};
    const odooData = session.odooData;
    if (!odooData) {
      broadcast('QUICK_BRIEF_COMPLETE', { success: false, error: 'No customer data' });
      return;
    }

    // Fetch project info (lightweight RPC — runs always, fast)
    const projectInfo = await fetchProjectInfo(tabId, odooData.partnerId || 0);

    const prompt = buildQuickBriefPrompt(odooData, projectInfo);
    const messages = [
      { role: 'system', content: QUICK_BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ];

    let fullText = '';
    await ollamaChat(messages, 'quick_brief', (_chunk, accumulated) => {
      fullText = accumulated;
    });

    // Thinking models (qwen3.x etc.) wrap the answer in reasoning text —
    // extractJsonObject strips <think> blocks and finds the real JSON answer
    const brief = extractJsonObject(fullText,
      ['companyOverview', 'painPoints', 'industry', 'project', 'contact']);

    if (!brief) {
      const snippet = (fullText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      broadcast('QUICK_BRIEF_COMPLETE', {
        success: false,
        error: `Could not parse AI response${snippet ? ` — model said: "${snippet}…"` : ' (empty response)'}`
      });
      return;
    }

    // Persist into session so it survives panel close
    const updated = await getSessionState(tabId) || {};
    await saveSessionState(tabId, { ...updated, quickBrief: brief, projectInfo });

    broadcast('QUICK_BRIEF_COMPLETE', { success: true, brief, projectInfo });
  } catch (err) {
    broadcast('QUICK_BRIEF_COMPLETE', { success: false, error: err.message });
  } finally {
    endLongWork();
  }
}

async function runResearch(payload) {
  const { tabId, customerName, deepSearch = false } = payload;
  beginLongWork(); // survive panel close / SW idle reaping for the whole phase
  try {
    const session0 = await getSessionState(tabId) || {};
    const partnerId = session0.odooData?.partnerId || 0;
    const soId = parseInt(session0.odooData?.soId || '0', 10) || 0;

    // Warm the heavyweight plan model NOW so its 30-120s cold load overlaps
    // data collection instead of stalling the Analyze phase.
    prewarmModel('analysis');

    // All collectors are independent — fire simultaneously. Each one catches
    // its own errors and returns a safe default, so Promise.all cannot reject.

    // Current order's chatter: one mail.message RPC (~0.4s). The old
    // scroll-and-click path (9-50s of fixed sleeps) remains as fallback only.
    const chatterTask = (async () => {
      await broadcast('RESEARCH_PROGRESS', { step: 'chatter', status: 'running' });
      let history = await fetchChatterRpc(tabId, soId);
      if (!Array.isArray(history)) history = await scrollAndExtractChatter(tabId, deepSearch);
      await broadcast('RESEARCH_PROGRESS', { step: 'chatter', status: 'done', count: history.length });
      return history;
    })();

    // Sales history via RPC — all company orders + their chatter, no tabs
    const salesHistoryTask = (async () => {
      await broadcast('RESEARCH_PROGRESS', { step: 'sales_history', status: 'running' });
      const result = await fetchSalesHistory(tabId, partnerId);
      await broadcast('RESEARCH_PROGRESS', {
        step: 'sales_history',
        status: (result.messages.length || result.orders.length) ? 'done' : 'not_found',
        count: result.messages.length
      });
      return result;
    })();

    // Customer 360 — opportunities, invoices, contacts, tickets, MRR trend
    const collectorErrors = [];
    const partnerIntelTask = (async () => {
      await broadcast('RESEARCH_PROGRESS', { step: 'partner_intel', status: 'running' });
      const intel = await fetchPartnerIntel(tabId, partnerId);
      if (intel?.__error) {
        collectorErrors.push('partner_intel');
        logWarn('collector.partner_intel.error', { error: intel.__error });
        await broadcast('RESEARCH_PROGRESS', { step: 'partner_intel', status: 'error' });
        return null;
      }
      await broadcast('RESEARCH_PROGRESS', {
        step: 'partner_intel',
        status: intel ? 'done' : 'not_found',
        counts: intel ? {
          opps: intel.opportunities?.length || 0,
          invoices: intel.invoices?.count || 0,
          contacts: intel.contacts?.total || 0
        } : null
      });
      return intel;
    })();

    // Company website via Google (Deep Search only)
    const websiteTask = deepSearch ? (async () => {
      await broadcast('RESEARCH_PROGRESS', { step: 'google_search', status: 'running' });
      const websiteUrl = await fetchCompanyWebsite(customerName);
      await broadcast('RESEARCH_PROGRESS', { step: 'google_search', status: websiteUrl ? 'done' : 'not_found' });
      return websiteUrl ? await fetchCompanyWebsiteContent(websiteUrl) : '';
    })() : Promise.resolve('');

    // Tasks & Timesheets via Odoo RPC (Deep Search only)
    const deepIntelTask = deepSearch ? (async () => {
      await broadcast('RESEARCH_PROGRESS', { step: 'deep_intel', status: 'running' });
      const intel = await extractDeepIntel(tabId, partnerId);
      await broadcast('RESEARCH_PROGRESS', {
        step: 'deep_intel',
        status: intel ? 'done' : 'not_found',
        counts: intel ? {
          orders: intel.salesOrders?.length || 0,
          tasks: intel.tasks?.length || 0,
          hours: intel.timesheets?.totalHours || 0
        } : null
      });
      return intel;
    })() : Promise.resolve(null);

    const [
      fullChatHistory,
      { orders: previousOrders, messages: salesHistoryMessages },
      partnerIntel,
      websiteText,
      deepIntel
    ] = await Promise.all([chatterTask, salesHistoryTask, partnerIntelTask, websiteTask, deepIntelTask]);

    const researchData = {
      websiteText,
      chatHistory: fullChatHistory,
      salesHistory: salesHistoryMessages,
      previousOrders,
      partnerIntel,
      deepIntel,
      collectorErrors   // which collectors hit an RPC read error (vs no data)
    };

    // Persist and update odooData with chatter + sales history
    const updated = await getSessionState(tabId) || {};
    if (updated.odooData) {
      updated.odooData.chatHistory = fullChatHistory;
      updated.odooData.salesHistory = salesHistoryMessages;
    }
    await saveSessionState(tabId, { ...updated, researchData });

    await broadcast('RESEARCH_COMPLETE', { researchData });
  } finally {
    endLongWork();
  }
}

// ── Analysis phase ───────────────────────────────────────────────────────────

// Cancellation: each START_ANALYSIS supersedes the previous run. The old
// stream is aborted (a Retry no longer double-streams into the same panel),
// and a stale run's broadcasts are suppressed by the runId check.
let _analysisRunSeq = 0;
let _analysisAbort = null;

function cancelAnalysis() {
  _analysisRunSeq++;
  if (_analysisAbort) { _analysisAbort.abort(); _analysisAbort = null; }
}

async function runAnalysis(payload) {
  const { tabId, odooData, researchData } = payload;

  cancelAnalysis();
  const runId = _analysisRunSeq;
  const controller = new AbortController();
  _analysisAbort = controller;
  const isStale = () => runId !== _analysisRunSeq;

  beginLongWork();
  try {
    const running = await ollamaAvailable();
    if (!running) {
      await broadcast('ANALYSIS_COMPLETE', {
        success: false,
        error: 'Local Ollama server unreachable. Check the server URL in Settings (⚙) or contact IT.'
      });
      return;
    }

    // Company profile: ONLY when there is real website text to analyze.
    // With Deep Search off the old code asked the model to invent a profile
    // from the bare company name and labeled the fabrication "Web Research".
    let companyProfile = { summary: 'No web research performed (Deep Search off).' };
    if ((researchData.websiteText || '').trim()) {
      await broadcast('ANALYSIS_PROGRESS', { step: 'profile', status: 'running' });
      try {
        const profileJson = await ollamaChat(
          [
            { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
            { role: 'user', content: buildResearchPrompt(odooData.customerName, researchData.websiteText) }
          ],
          'quick_brief',
          () => {},
          controller.signal
        );
        companyProfile = extractJsonObject(profileJson)
          || { summary: 'Web research not available — proceeding with subscription data only.' };
      } catch (err) {
        if (err.message === 'CANCELLED' || isStale()) return;
        companyProfile = { summary: 'Web research not available — proceeding with subscription data only.' };
      }
    }
    if (isStale()) return;

    await broadcast('ANALYSIS_PROGRESS', { step: 'profile', status: 'done', companyProfile });

    // Reload session to get dbInfo / installedModules added by enrichment
    const latestSession = await getSessionState(tabId) || {};
    const latestOdooData = latestSession.odooData || odooData;

    // Use full chat history and sales history from research phase
    const enrichedOdooData = {
      ...latestOdooData,
      chatHistory: researchData.chatHistory?.length ? researchData.chatHistory : latestOdooData.chatHistory,
      salesHistory: researchData.salesHistory || []
    };

    // Learning layer: prior reviews of this account + the CSM's 👍 examples.
    // Compute Key Signals FIRST — its side effect sets enrichedOdooData.healthTierNow,
    // which the memory block's "What Changed Since Last Review" health diff reads.
    const keySignals = buildKeySignals(enrichedOdooData, researchData);
    const pKey = partnerKeyFor(enrichedOdooData);
    const memory = await getAccountMemory(pKey);
    const memoryBlock = buildMemoryBlock(memory, enrichedOdooData);
    const likedExamplesBlock = await buildLikedExamplesBlock(2);

    let planText = '';
    const planStart = Date.now();
    // Streaming emits per-token deltas — throttle broadcasts so the panel
    // repaints smoothly instead of re-rendering hundreds of times per second.
    // Partial text is ALSO persisted every ~3s: closing the panel mid-stream
    // no longer discards minutes of completed GPU work.
    let lastPlanBroadcast = 0;
    let lastPlanPersist = 0;
    // Report which model is actually running so the panel can show it and warn
    // on a silent quality downgrade (preferred smart model missing, or a stall
    // forced the fast fallback).
    const onModel = (info) => {
      if (isStale()) return;
      if (info.degraded) {
        logWarn('model.degraded', { phase: info.phase, using: info.model, preferred: info.preferred, reason: info.reason });
      } else {
        logInfo('model.selected', { model: info.model });
      }
      broadcast('ANALYSIS_MODEL', info);
    };
    try {
      await ollamaChat(
        [
          { role: 'system', content: ACTION_PLAN_SYSTEM_PROMPT },
          { role: 'user', content: buildActionPlanPrompt(enrichedOdooData, companyProfile, researchData, { memoryBlock, likedExamplesBlock, keySignals }) }
        ],
        'analysis',
        (chunk, accumulated) => {
          if (isStale()) return;
          planText = accumulated;
          const now = Date.now();
          if (now - lastPlanBroadcast >= 150) {
            lastPlanBroadcast = now;
            broadcast('ANALYSIS_PROGRESS', { step: 'plan', chunk, accumulated });
          }
          if (now - lastPlanPersist >= 3000) {
            lastPlanPersist = now;
            getSessionState(tabId).then(s =>
              saveSessionState(tabId, { ...(s || {}), partialPlanText: accumulated, partialPlanAt: Date.now() })
            ).catch(() => {});
          }
        },
        controller.signal,
        onModel
      );
    } catch (err) {
      if (err.message === 'CANCELLED' || isStale()) return;
      logError('analysis.fail', { error: err.message, ms: Date.now() - planStart });
      await broadcast('ANALYSIS_COMPLETE', { success: false, error: `Plan generation failed: ${err.message}`, companyProfile, planText: '', activities: [] });
      return;
    }
    if (isStale()) return;

    if (!planText || planText.trim().length < 50) {
      await broadcast('ANALYSIS_COMPLETE', { success: false, error: 'The model returned an empty response. Check the model name in Settings and that the Ollama server is healthy.', companyProfile, planText: '', activities: [] });
      return;
    }

    const activities = parseActivitiesFromPlan(planText);
    // Code-side grounding check on each activity's "Reference:" line
    const referenceChecks = verifyActivityReferences(activities, enrichedOdooData, researchData);
    const coverage = computeDataCoverage(enrichedOdooData, researchData);
    const generatedAt = Date.now();

    const session = await getSessionState(tabId) || {};
    delete session.partialPlanText;
    delete session.partialPlanAt;
    await saveSessionState(tabId, {
      ...session, companyProfile, planText, activities, referenceChecks, coverage, generatedAt,
      healthTier: enrichedOdooData.healthTierNow || null   // set by buildKeySignals — persisted for the memory layer
    });

    const unverified = referenceChecks.filter(c => c?.verified === false).length;
    logInfo('analysis.ok', {
      ms: Date.now() - planStart, activities: activities.length,
      unverifiedRefs: unverified, parsedFromJson: /```json/.test(planText)
    });
    if (!activities.length) logWarn('analysis.no_activities_parsed', {});

    await broadcast('ANALYSIS_COMPLETE', { success: true, companyProfile, planText, activities, referenceChecks, coverage, generatedAt });
  } finally {
    if (_analysisAbort === controller) _analysisAbort = null;
    endLongWork();
  }
}

// ── Draft message generation (per-activity, on demand) ──────────────────────

async function runDraftMessage({ tabId, index, activity }) {
  beginLongWork();
  try {
    broadcast('DRAFT_PROGRESS', { index, status: 'running' });
    const session = await getSessionState(tabId) || {};
    const odooData = session.odooData || {};
    let text = '';
    await ollamaChat(
      [
        { role: 'system', content: DRAFT_MESSAGE_SYSTEM_PROMPT },
        { role: 'user', content: buildDraftMessagePrompt(activity, odooData) }
      ],
      'quick_brief',
      (_chunk, accumulated) => { text = accumulated; broadcast('DRAFT_PROGRESS', { index, status: 'running', accumulated }); }
    );
    logInfo('draft.ok', { index, chars: text.length });
    broadcast('DRAFT_COMPLETE', { index, success: true, text });
  } catch (err) {
    logError('draft.fail', { error: err.message });
    broadcast('DRAFT_COMPLETE', { index, success: false, error: err.message });
  } finally {
    endLongWork();
  }
}

// ── Activity creation ────────────────────────────────────────────────────────

// Legacy UI-automation creator — kept ONLY as fallback for databases where the
// mail.activity RPC create is denied. ~8s of choreographed clicking per activity.
async function createActivitiesViaUi(tabId, activities) {
  try {
    // Self-contained: all helpers inlined so executeScript needs no globals
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (acts) => {
        function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

        function waitForElement(selector, timeout = 6000) {
          return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const obs = new MutationObserver(() => {
              const f = document.querySelector(selector);
              if (f) { obs.disconnect(); resolve(f); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
          });
        }

        function nativeSet(input, value) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        async function createSingleActivity(activity) {
          // ── 1. Open the Schedule Activity dialog ──
          let schedBtn = null;
          for (const sel of ['button[name="activity_schedule"]', '.o-mail-ActivityButton button', '.o_chatter_button_schedule_activity', 'button[data-action="schedule_activity"]']) {
            schedBtn = document.querySelector(sel);
            if (schedBtn) break;
          }
          if (!schedBtn) {
            schedBtn = [...document.querySelectorAll('.oe_chatter button, .o-mail-Chatter button, .o-mail-Thread button')]
              .find(b => /activ/i.test(b.textContent + b.title + (b.getAttribute('aria-label') || '')));
          }
          if (!schedBtn) throw new Error('Schedule Activity button not found');
          schedBtn.scrollIntoView({ block: 'nearest' });
          await delay(200);
          schedBtn.click();

          const dialog = await waitForElement('.o_dialog .o_form_view, .modal-content .o_form_view').catch(() => null)
            || await waitForElement('.o_dialog, .modal-content').catch(() => null);
          if (!dialog) throw new Error('Activity dialog did not open');
          await delay(500);

          // ── 2. Select activity type badge icon ──
          // The date/summary group is invisible until an activity type is chosen (form: invisible="not activity_type_id")
          const typeField = dialog.querySelector('div[name="activity_type_id"]');
          if (typeField) {
            const typeKey = (activity.activityType || '').toLowerCase();
            const keywords = typeKey.includes('phone') ? ['phone', 'call', 'tel']
              : typeKey.includes('email') ? ['email', 'mail', 'envelope']
              : typeKey.includes('meeting') ? ['meeting', 'calendar', 'rendez']
              : [typeKey];

            const badges = [...typeField.querySelectorAll('button')];
            let matched = null;
            for (const b of badges) {
              const text = (b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
              const icon = [...b.querySelectorAll('[class]')].map(el => el.className).join(' ').toLowerCase();
              if (keywords.some(k => text.includes(k) || icon.includes(k))) { matched = b; break; }
            }
            // If no keyword match, click first available badge (any type is better than none)
            if (!matched && badges.length > 0) matched = badges[0];
            if (matched) {
              matched.click();
              await delay(800); // wait for Owl to re-render — date/summary group becomes visible
            }
          }

          // ── 3. Fill summary ──
          const summaryInput = dialog.querySelector('div[name="summary"] input');
          if (summaryInput) { nativeSet(summaryInput, activity.summary.slice(0, 60)); await delay(200); }

          // ── 4. Set date via calendar picker (Odoo 19 — verified from odoo/odoo@19.0 source) ──
          // From datetime_picker.xml:
          //   - Container: .o_datetime_picker
          //   - Header zoom button: button.o_zoom_out (text e.g. "May 2026")
          //   - Prev/Next: button.o_previous / button.o_next
          //   - Day cells: <div class="o_date_item_cell"> with inner <div> containing label
          //   - Out-of-range cells (prev/next month edges): .o_out_of_range (clickable but jumps month)
          //   - Disabled cells: .opacity-50 OR have disabled attribute
          //   - Click handler is on outer div: t-on-click="() => this.zoomOrSelect(itemInfo)"
          if (activity.dueDate) {
            const [yStr, mStr, dStr] = activity.dueDate.split('-');
            const targetY = parseInt(yStr, 10);
            const targetM = parseInt(mStr, 10);
            const targetD = parseInt(dStr, 10);

            // Poll up to 3s for date field to become visible (hidden until activity type selected)
            let dateField = null;
            for (let i = 0; i < 15; i++) {
              dateField = dialog.querySelector('div[name="date_deadline"]');
              if (dateField && dateField.offsetParent !== null) break;
              dateField = null;
              await delay(200);
            }

            if (dateField) {
              // Open picker — Odoo 19 renders the field as <button> not <input>
              const dateBtn = dateField.querySelector('button') || dateField.querySelector('input');
              if (dateBtn) {
                dateBtn.click();
                await delay(900);
              }

              // Picker can be inside the dialog OR in .o-main-components-container (popover outside dialog)
              let picker = null;
              for (let i = 0; i < 10; i++) {
                picker = document.querySelector('.o_datetime_picker');
                if (picker && picker.offsetParent !== null) break;
                await delay(200);
              }

              if (picker) {
                const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

                // Navigate to the target month/year
                for (let nav = 0; nav < 24; nav++) {
                  const zoomOut = picker.querySelector('button.o_zoom_out');
                  if (!zoomOut) break;

                  const headerText = (zoomOut.textContent || '').trim().toLowerCase();
                  const mIdx = MONTHS.findIndex(m => headerText.includes(m));
                  const yMatch = headerText.match(/\d{4}/);
                  if (mIdx < 0 || !yMatch) break;

                  const curM = mIdx + 1;
                  const curY = parseInt(yMatch[0], 10);

                  if (curY === targetY && curM === targetM) break;

                  const goFwd = curY < targetY || (curY === targetY && curM < targetM);
                  const navBtn = picker.querySelector(goFwd ? 'button.o_next' : 'button.o_previous');
                  if (!navBtn) break;
                  navBtn.click();
                  await delay(350);
                }

                await delay(300);

                // Now click the target day
                // Re-query picker in case DOM was replaced during navigation
                const finalPicker = document.querySelector('.o_datetime_picker') || picker;
                const dayCells = finalPicker.querySelectorAll('.o_date_item_cell');

                let clicked = false;
                for (const cell of dayCells) {
                  // Skip out-of-range (would jump month) and disabled cells
                  if (cell.classList.contains('o_out_of_range')) continue;
                  if (cell.classList.contains('opacity-50')) continue;
                  if (cell.hasAttribute('disabled')) continue;

                  // Day number is in cell text (possibly inside child div for "today" highlight)
                  const text = (cell.textContent || '').trim();
                  const dayNum = parseInt(text, 10);

                  if (dayNum === targetD) {
                    // Dispatch a real pointer/click sequence — Odoo uses Owl pointer events
                    const rect = cell.getBoundingClientRect();
                    const opts = { bubbles: true, cancelable: true, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 };
                    cell.dispatchEvent(new PointerEvent('pointerenter', opts));
                    cell.dispatchEvent(new PointerEvent('pointerdown', opts));
                    cell.dispatchEvent(new PointerEvent('pointerup', opts));
                    cell.dispatchEvent(new MouseEvent('mousedown', opts));
                    cell.dispatchEvent(new MouseEvent('mouseup', opts));
                    cell.click();
                    clicked = true;
                    break;
                  }
                }

                await delay(500);

                // Picker auto-closes on day click for date-only fields.
                // If it's still open (datetime field with Apply), click Apply.
                const stillOpen = document.querySelector('.o_datetime_picker');
                if (stillOpen) {
                  const applyBtn = stillOpen.querySelector('button.o_apply');
                  if (applyBtn) applyBtn.click();
                  else {
                    // Click outside the picker to close (on the dialog body)
                    document.body.click();
                  }
                  await delay(400);
                }

                if (!clicked) {
                  // Fallback: type the date directly into the field if click failed
                  const input = dateField.querySelector('input') || dateField.querySelector('button');
                  if (input && input.tagName === 'INPUT') {
                    // Odoo 19 date format is usually MM/DD/YYYY in the displayed input
                    const formatted = `${String(targetM).padStart(2,'0')}/${String(targetD).padStart(2,'0')}/${targetY}`;
                    nativeSet(input, formatted);
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await delay(300);
                  }
                }
              }
            }
          }

          // ── 5. Notes — fill the activity-specific notes (Trigger/Ask/Reference) ──
          if (activity.notes) {
            // The notes field is a rich-text editor in the activity dialog
            const noteSels = [
              'div[name="note"] .odoo-editor-editable',
              'div[name="note"] .o_field_html',
              'div[name="note"] .note-editable',
              '.o_field_html[name="note"] .odoo-editor-editable',
              '.o_field_html .odoo-editor-editable'
            ];
            let noteEditor = null;
            for (const sel of noteSels) {
              noteEditor = dialog.querySelector(sel);
              if (noteEditor) break;
            }
            if (noteEditor) {
              // Strip markdown bold/italic for the Notes field (it's a rich editor; plain text is cleaner)
              const clean = activity.notes
                .replace(/\*\*(.+?)\*\*/g, '$1')
                .replace(/\*(.+?)\*/g, '$1')
                .replace(/^[\s\-\*]+/gm, '• ')
                .trim();

              // Use innerHTML with paragraph breaks for proper rendering
              const html = clean.split('\n').filter(Boolean).map(line => `<p>${line.replace(/</g, '&lt;')}</p>`).join('');
              noteEditor.innerHTML = html;
              noteEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
              await delay(200);
            }
          }

          // ── 6. Confirm — form XML: button name="action_schedule_activities" ──
          await delay(300);
          const confirmBtn =
            document.querySelector('button[name="action_schedule_activities"]') ||
            document.querySelector('.o_dialog footer button.btn-primary, .modal-content footer button.btn-primary') ||
            [...document.querySelectorAll('.o_dialog button.btn-primary, .modal-content button.btn-primary')]
              .find(b => /save|schedule|confirm/i.test(b.textContent));
          if (!confirmBtn) throw new Error('Schedule confirm button not found');
          confirmBtn.click();
          await delay(1500);

          if (document.querySelector('.o_dialog .o_form_view, .modal-content .o_form_view')) {
            throw new Error('Activity dialog did not close after confirm');
          }
        }

        const results = [];
        for (const activity of acts) {
          try {
            await createSingleActivity(activity);
            results.push({ success: true, summary: activity.summary });
          } catch (err) {
            results.push({ success: false, summary: activity.summary, error: err.message });
          }
          await delay(1500);
        }

        return results;
      },
      args: [activities]
    });
    return results?.[0]?.result || [];
  } catch (err) {
    return activities.map(a => ({ success: false, summary: a.summary, error: err.message }));
  }
}

// Resolve the RPC context once: sale.order's ir.model id + activity-type ids.
async function resolveActivityRpcContext(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const rpc = async (model, method, args, kwargs) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
        });
        const j = await r.json();
        if (j.error) throw new Error(j.error.data?.message || j.error.message || 'RPC error');
        return j.result;
      };
      const soId = parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
      const [models, types] = await Promise.all([
        rpc('ir.model', 'search_read', [[['model', '=', 'sale.order']]], { fields: ['id'], limit: 1 }),
        rpc('mail.activity.type', 'search_read', [[]], { fields: ['id', 'name'], limit: 40 })
      ]);
      return { soId, resModelId: models?.[0]?.id || null, types: types || [] };
    }
  });
  return results?.[0]?.result || null;
}

function pickActivityTypeId(types, activityType) {
  const want = activityType === 'Phone Call' ? /call|phone/i
    : activityType === 'Email' ? /e-?mail/i
    : /meeting/i;
  const hit = types.find(t => want.test(t.name)) || types.find(t => /to.?do/i.test(t.name)) || types[0];
  return hit?.id || null;
}

async function createActivityViaRpc(tabId, ctx, activity) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [{
      resModelId: ctx.resModelId,
      soId: ctx.soId,
      typeId: pickActivityTypeId(ctx.types, activity.activityType),
      summary: (activity.summary || '').slice(0, 60),
      dueDate: activity.dueDate,
      // Plain text → simple HTML for the note field; angle brackets escaped
      noteHtml: String(activity.notes || '')
        .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
        .split('\n').filter(Boolean)
        .map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/^[\s\-•]+/, '• ')}</p>`)
        .join('')
    }],
    func: async (p) => {
      if (!p.resModelId || !p.soId || !p.typeId) return { rpcFailed: true, error: 'RPC context incomplete' };
      try {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call', id: Date.now(),
            params: {
              model: 'mail.activity', method: 'create',
              args: [{
                res_model_id: p.resModelId,
                res_id: p.soId,
                activity_type_id: p.typeId,
                summary: p.summary,
                date_deadline: p.dueDate,
                note: p.noteHtml
              }],
              kwargs: {}
            }
          })
        });
        const j = await r.json();
        if (j.error) return { rpcFailed: true, error: j.error.data?.message || j.error.message || 'RPC error' };
        return { success: true };
      } catch (err) {
        return { rpcFailed: true, error: err.message };
      }
    }
  });
  return results?.[0]?.result || { rpcFailed: true, error: 'No result from page' };
}

async function runActivityCreation(payload) {
  const { tabId, activities, feedback = {} } = payload;
  beginLongWork();
  try {
    // RPC-first: <1s per activity, immune to Odoo UI redesigns, no page hijack.
    let ctx = null;
    try { ctx = await resolveActivityRpcContext(tabId); } catch { ctx = null; }

    const creationResults = [];
    for (const activity of activities) {
      let result;
      if (ctx?.resModelId && ctx?.soId && ctx.types?.length) {
        const rpcRes = await createActivityViaRpc(tabId, ctx, activity);
        result = rpcRes.success
          ? { success: true, summary: activity.summary }
          : (await createActivitiesViaUi(tabId, [activity]))[0]
            || { success: false, summary: activity.summary, error: rpcRes.error };
      } else {
        result = (await createActivitiesViaUi(tabId, [activity]))[0]
          || { success: false, summary: activity.summary, error: 'Creation failed' };
      }
      creationResults.push(result);
      // Real-time per-activity progress (the old code batched all results at the end)
      await broadcast('ACTIVITY_PROGRESS', result);
    }

    // Learning layer: persist this review to per-account memory BEFORE marking
    // the session executed. Proposed (AI) vs final (CSM-edited) is the signal.
    try {
      const session = await getSessionState(tabId) || {};
      const od = session.odooData || {};
      const pKey = partnerKeyFor(od);
      if (pKey) {
        await recordReview(pKey, od.customerName, {
          soNumber: od.soNumber,
          healthTier: session.healthTier || od.healthTierNow || null,
          daysUntilRenewal: od.daysUntilRenewal ?? null,
          utilization: od.dbInfo?.utilization ?? null,
          recurringAmount: od.recurringAmount || null,
          planText: session.planText || '',
          proposedActivities: session.activities || [],
          finalActivities: activities,
          feedback,
          created: creationResults.some(r => r.success)
        });
      }
      // Keep the session (plan stays reviewable/copyable) — just mark it done.
      await saveSessionState(tabId, { ...session, executedAt: Date.now(), executionResults: creationResults, memoryKey: pKey });
    } catch { /* memory write is best-effort */ }

    await broadcast('ACTIVITY_COMPLETE', { results: creationResults });
  } catch (err) {
    // Surface error so panel can show it
    await broadcast('ACTIVITY_COMPLETE', { success: false, error: err.message, results: [] });
  } finally {
    endLongWork();
  }
}

// ── Extension icon click ─────────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// ── Portfolio Scanner ─────────────────────────────────────────────────────────

async function runPortfolioScan({ tabId }) {
  beginLongWork();
  try {
    broadcast('PORTFOLIO_PROGRESS', { step: 'fetch_subs', status: 'running', label: 'Fetching subscriptions…' });

    // Step 1: RPC fetch subscriptions (runs in Odoo tab — uses user session)
    const subsResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const rpc = (model, method, args, kwargs) => fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(),
            params: { model, method, args, kwargs } })
        }).then(r => r.json()).then(d => d.result);

        // Get session uid
        const sessionResp = await fetch('/web/session/get_session_info', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
        }).then(r => r.json());
        const uid = sessionResp?.result?.uid;
        if (!uid) return { subs: [], error: 'Could not get session' };

        const subs = await rpc('sale.order', 'search_read',
          [[['user_id', '=', uid], ['subscription_state', '=', '3_progress']]],
          { fields: ['id','name','partner_id','next_invoice_date','end_date',
                     'recurring_monthly','activity_summary','activity_date_deadline'],
            limit: 150, order: 'next_invoice_date asc' }
        );
        return { subs: subs || [], uid };
      }
    });

    const { subs = [], error: subsError } = subsResult?.[0]?.result || {};
    if (subsError || !subs.length) {
      broadcast('PORTFOLIO_COMPLETE', { success: false, error: subsError || 'No subscriptions found' });
      return;
    }

    broadcast('PORTFOLIO_PROGRESS', { step: 'fetch_subs', status: 'done', label: `${subs.length} accounts loaded`, count: subs.length });
    broadcast('PORTFOLIO_PROGRESS', { step: 'fetch_msgs', status: 'running', label: 'Loading chatter history…' });

    // Step 2: Fetch chatter for ALL accounts, batches fired in parallel.
    // (The old loop was sequential and hard-capped at 120 subs — accounts
    // 121-150 silently presented as "no chatter" and got flagged "no
    // relationship built" by the prompt: a fabricated signal.)
    const allIds = subs.map(s => s.id);
    const batchSize = 40;
    const batches = [];
    for (let i = 0; i < allIds.length; i += batchSize) batches.push(allIds.slice(i, i + batchSize));

    const batchResults = await Promise.all(batches.map(batchIds =>
      chrome.scripting.executeScript({
        target: { tabId },
        func: async (ids) => {
          const resp = await fetch('/web/dataset/call_kw', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(),
              params: { model: 'mail.message', method: 'search_read',
                args: [[['res_id','in',ids],['model','=','sale.order'],['message_type','in',['comment','email']]]],
                kwargs: { fields: ['res_id','author_id','date','body'], limit: 400, order: 'date desc' }
              }})
          });
          const data = await resp.json();
          return data.result || [];
        },
        args: [batchIds]
      }).then(r => r?.[0]?.result || []).catch(() => [])
    ));
    const allMessages = batchResults.flat();

    broadcast('PORTFOLIO_PROGRESS', { step: 'fetch_msgs', status: 'done', label: `${allMessages.length} messages loaded` });

    // Step 3: Build per-account profiles (strip payment/billing noise — irrelevant for CSM)
    const PAYMENT_NOISE = /payment.{0,40}(reference|confirmed|received|processed|posted|registered|refused|failed|declined|rejected)|thank you for your trust|invoice.{0,40}(sent|paid|generated|due)|email sent to customer|insufficient.{0,20}(funds|balance)|transaction.{0,40}(posted|completed|approved|declined|failed)|next invoice.{0,30}set to|card.{0,20}(declined|expired|failed)|auto[-\s]?renewal.{0,30}(failed|succeeded|processed)|kindly use this payment link|access[-_]?token=|mailer.?daemon|a payment with reference|reminder.{0,40}(invoice|payment|overdue)|overdue.{0,30}(invoice|payment)/i;

    const msgsByRecord = {};
    allMessages.forEach(m => {
      const rawBody = (m.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const author = (m.author_id?.[1] || '').toLowerCase();
      const isBot = author === 'odoobot' || author === 'odoo bot' || author === 'system' || author === 'mailer-daemon';
      // Drop payment-related noise
      if (PAYMENT_NOISE.test(rawBody)) return;
      if (isBot && /payment|invoice|transaction|reference/i.test(rawBody)) return;
      if (rawBody.length <= 20) return;

      if (!msgsByRecord[m.res_id]) msgsByRecord[m.res_id] = [];
      msgsByRecord[m.res_id].push({
        date: m.date?.slice(0, 10), author: m.author_id?.[1], body: rawBody.slice(0, 280)
      });
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const profiles = subs.map(r => {
      const msgs = msgsByRecord[r.id] || [];
      const lastMsg = msgs[0];
      const daysSinceLast = lastMsg ? Math.round((today - new Date(lastMsg.date)) / 86400000) : null;
      const daysToRenewal = r.next_invoice_date
        ? Math.round((new Date(r.next_invoice_date) - today) / 86400000) : null;
      return {
        id: r.id, so: r.name, partner: r.partner_id?.[1],
        monthly: r.recurring_monthly, nextInvoice: r.next_invoice_date,
        daysToRenewal, activity: r.activity_summary, actDeadline: r.activity_date_deadline,
        msgCount: msgs.length, daysSinceLast,
        recentMsgs: msgs.slice(0, 5).map(m => `[${m.date}] ${m.author}: ${m.body.slice(0, 250)}`)
      };
    });

    // Step 4: AI analysis — CHUNKED. A 150-account prompt is ~60-75K tokens
    // and cannot fit the 16K context; the old single call silently trimmed
    // most of the book while reporting full coverage. ~20 accounts per call,
    // tiers merged in code, Summary Stats computed deterministically.
    const chunks = chunkProfiles(profiles);
    const tierMap = {};
    const tierTexts = { 1: [], 2: [], 3: [], 4: [] };

    for (let c = 0; c < chunks.length; c++) {
      broadcast('PORTFOLIO_PROGRESS', { step: 'analyze', status: 'running',
        label: `AI analyzing… (batch ${c + 1} of ${chunks.length})` });

      const prompt = buildPortfolioPrompt(chunks[c], { index: c, count: chunks.length });
      let chunkText = '';
      let lastPortfolioBroadcast = 0;
      await ollamaChat(
        [{ role: 'system', content: PORTFOLIO_SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        'portfolio',
        (chunk, accumulated) => {
          chunkText = accumulated;
          const now = Date.now();
          if (now - lastPortfolioBroadcast >= 150) {
            lastPortfolioBroadcast = now;
            broadcast('PORTFOLIO_PROGRESS', { step: 'analyze', status: 'running',
              label: `AI analyzing… (batch ${c + 1} of ${chunks.length})`, accumulated });
          }
        }
      );

      // Tier assignments from the chunk's trailing json block
      const tierObj = extractJsonObject(chunkText, ['tiers']);
      for (const [so, tier] of Object.entries(tierObj?.tiers || {})) {
        const t = parseInt(tier, 10);
        if (t >= 1 && t <= 4) tierMap[so] = t;
      }

      // Split the chunk's markdown into its tier sections and merge across chunks
      const body = chunkText.replace(/```[\s\S]*?```/g, '');
      const sections = body.split(/^(?=##\s*TIER\s*\d)/im);
      for (const sec of sections) {
        const m = sec.match(/^##\s*TIER\s*(\d)/i);
        if (!m) continue;
        const t = parseInt(m[1], 10);
        if (tierTexts[t]) tierTexts[t].push(sec.replace(/^##\s*TIER\s*\d[^\n]*\n?(\([^\n]*\)\n?)?/i, '').trim());
      }
    }

    const stats = computePortfolioStats(profiles, tierMap);
    const tierHeaders = {
      1: '## TIER 1 — Act Today', 2: '## TIER 2 — This Week',
      3: '## TIER 3 — Next 30 Days', 4: '## TIER 4 — Upsell Pipeline'
    };
    const merged = [1, 2, 3, 4]
      .filter(t => tierTexts[t].some(s => s.trim()))
      .map(t => `${tierHeaders[t]}\n${tierTexts[t].filter(Boolean).join('\n')}`)
      .join('\n\n');

    const statsText = `## Summary Stats (computed from data, not by the AI)
- Total accounts analyzed: ${stats.total}${stats.unassigned ? ` (${stats.unassigned} not tier-assigned by the model)` : ''}
- Tier 1 (act today): ${stats.tier1} · Tier 2 (this week): ${stats.tier2} · Tier 3: ${stats.tier3} · Tier 4 (upsell): ${stats.tier4}
- Total MRR at risk (Tier 1+2): $${stats.mrrAtRisk.toLocaleString()}
${stats.topUpsell ? `- Top upsell opportunity by value: ${stats.topUpsell}` : ''}`;

    const fullText = `${merged}\n\n${statsText}`.trim();
    const generatedAt = Date.now();

    // Persist — a multi-minute scan must survive closing the panel
    await savePortfolioResult({ planText: fullText, profileCount: profiles.length, stats });

    broadcast('PORTFOLIO_COMPLETE', { success: true, planText: fullText, profileCount: profiles.length, stats, generatedAt });

  } catch (err) {
    broadcast('PORTFOLIO_COMPLETE', { success: false, error: err.message });
  } finally {
    endLongWork();
  }
}

// Auto-refresh when user navigates to a different subscription in Odoo
const ODOO_PATTERN = /odoo\.com|localhost|127\.0\.0\.1/;
const SO_PATTERN   = /sale\.order|\/sales\/|\/subscriptions\/|[#&]model=sale/;

let navDebounceTimer = null;

// action-1592 is the CSM dashboard window-action id — shared by all users on the
// same Odoo database, so it holds for the whole floor on this instance
const DASHBOARD_PATTERN = /action-1592|\/board\//;

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (!ODOO_PATTERN.test(url)) return;

  // Broadcast dashboard navigation too
  if (DASHBOARD_PATTERN.test(url)) {
    setTimeout(() => broadcast('PAGE_NAVIGATED', { tabId, url, isDashboard: true }), 1500);
    return;
  }

  if (!SO_PATTERN.test(url)) return;

  // Debounce: Odoo may fire multiple URL changes during SPA navigation
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    navDebounceTimer = null;
    broadcast('PAGE_NAVIGATED', { tabId, url });
  }, 1500);
});

// ── Message router ───────────────────────────────────────────────────────────

// Only the extension's own side-panel page may trigger script injection or
// Odoo writes. Content scripts (which run inside web-page processes) are
// limited to their reporting message. Defense-in-depth: nothing external can
// reach this listener today (no externally_connectable), but this caps the
// blast radius if that ever changes.
const PANEL_ONLY_TYPES = new Set([
  'EXTRACT_PAGE_DATA', 'START_RESEARCH', 'START_ANALYSIS', 'CANCEL_ANALYSIS',
  'CREATE_ACTIVITIES', 'SAVE_SETTINGS', 'START_QUICK_BRIEF', 'SCAN_PORTFOLIO',
  'RESCHEDULE_ACTIVITIES', 'SET_ACTIVITY_FEEDBACK', 'DRAFT_MESSAGE',
  // does a fetch + installs a DNR origin-strip rule for an arbitrary URL — a
  // content script must not be able to probe intranet hosts through the SW
  'CHECK_OLLAMA_URL'
]);

function senderAllowed(msg, sender) {
  if (sender.id !== chrome.runtime.id) return false;
  if (PANEL_ONLY_TYPES.has(msg.type)) {
    return (sender.url || '').startsWith(chrome.runtime.getURL('sidepanel/'));
  }
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!senderAllowed(msg, sender)) {
        sendResponse({ success: false, error: 'Sender not allowed' });
        return;
      }
      switch (msg.type) {
        case 'EXTRACT_PAGE_DATA': {
          const result = await extractFromOdooTab(msg.payload.tabId);
          sendResponse(result);
          break;
        }
        case 'START_RESEARCH': {
          runResearch(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'START_ANALYSIS': {
          runAnalysis(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'CANCEL_ANALYSIS': {
          cancelAnalysis();
          sendResponse({ success: true });
          break;
        }
        case 'SET_ACTIVITY_FEEDBACK': {
          // 👍/👎 given on the Complete screen, after the memory entry exists
          await setLatestFeedback(msg.payload.memoryKey, msg.payload.feedback || {});
          sendResponse({ success: true });
          break;
        }
        case 'GET_PORTFOLIO_RESULT': {
          sendResponse({ success: true, data: await getPortfolioResult() });
          break;
        }
        case 'GET_ACCOUNT_MEMORY': {
          // Surface prior reviews in the UI (the learning layer was invisible)
          const session = await getSessionState(msg.payload.tabId) || {};
          const pKey = session.odooData ? partnerKeyFor(session.odooData) : null;
          const mem = pKey ? await getAccountMemory(pKey) : null;
          sendResponse({ success: true, data: mem });
          break;
        }
        case 'GET_DIAGNOSTICS': {
          const [events, settings] = await Promise.all([getDiagnostics(), getSettings()]);
          sendResponse({ success: true, data: {
            events,
            meta: {
              version: chrome.runtime.getManifest()?.version,
              smartModel: settings.ollamaModel, fastModel: settings.ollamaModelFast,
              ollamaUrl: settings.ollamaUrl
            }
          }});
          break;
        }
        case 'CLEAR_DIAGNOSTICS': {
          await clearDiagnostics();
          sendResponse({ success: true });
          break;
        }
        case 'DRAFT_MESSAGE': {
          runDraftMessage(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'CHECK_OLLAMA_URL': {
          // Probe a candidate URL WITHOUT saving it — "Test Connection" used to
          // silently overwrite working settings before testing.
          const TEST_RULE_ID = 1002;
          try {
            const base = String(msg.payload.url || '').replace(/\/$/, '');
            // Temporary Origin-strip rule for the candidate host (the permanent
            // rule 1001 only covers the currently-saved URL)
            try {
              await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [TEST_RULE_ID],
                addRules: [{
                  id: TEST_RULE_ID, priority: 1,
                  action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
                  condition: { urlFilter: `||${new URL(base).hostname}`, resourceTypes: ['xmlhttprequest'] }
                }]
              });
            } catch { /* best effort */ }
            const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
            const j = r.ok ? await r.json() : null;
            sendResponse({ success: true, data: { available: !!r.ok, models: (j?.models || []).map(m => m.name).filter(Boolean) } });
          } catch {
            sendResponse({ success: true, data: { available: false, models: [] } });
          } finally {
            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [TEST_RULE_ID] }).catch(() => {});
          }
          break;
        }
        case 'CREATE_ACTIVITIES': {
          runActivityCreation(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'GET_SETTINGS': {
          const s = await getSettings();
          sendResponse({ success: true, data: s });
          break;
        }
        case 'SAVE_SETTINGS': {
          await saveSettings(msg.payload);
          if (msg.payload.ollamaUrl !== undefined) await configureOllamaOriginRule();
          sendResponse({ success: true });
          break;
        }
        case 'GET_SESSION': {
          const state = await getSessionState(msg.payload.tabId);
          sendResponse({ success: true, data: state });
          break;
        }
        case 'CHECK_OLLAMA': {
          // Health ping and model list in parallel (was sequential)
          const [available, models] = await Promise.all([ollamaAvailable(), ollamaModels()]);
          sendResponse({ success: true, data: { available, models: available ? models : [] } });
          break;
        }
        case 'GOOGLE_SEARCH_RESULT': {
          googleResolve(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'START_QUICK_BRIEF': {
          runQuickBrief(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'SCAN_PORTFOLIO': {
          runPortfolioScan(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'RESCHEDULE_ACTIVITIES': {
          try {
            const result = await rescheduleOverdueActivities(msg.payload.baseUrl, {
              maxPerDay: msg.payload.maxPerDay,
              includeToday: msg.payload.includeToday ?? true,
              callsOnly: msg.payload.callsOnly ?? true,
              dryRun: msg.payload.dryRun ?? false,
              confirmPlan: msg.payload.confirmPlan ?? null
            });
            sendResponse({ success: true, data: result });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
          break;
        }
        case 'SW_KEEPALIVE':
          sendResponse({ alive: true });
          break;
        default:
          sendResponse({ success: false, error: `Unknown: ${msg.type}` });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

import {
  ollamaAvailable,
  ollamaChat,
  ollamaModels,
  buildResearchPrompt,
  buildActionPlanPrompt,
  buildPortfolioPrompt,
  buildQuickBriefPrompt,
  parseActivitiesFromPlan,
  extractJsonObject,
  RESEARCH_SYSTEM_PROMPT,
  ACTION_PLAN_SYSTEM_PROMPT,
  PORTFOLIO_SYSTEM_PROMPT,
  QUICK_BRIEF_SYSTEM_PROMPT
} from '../lib/ollama.js';
import { getSettings, saveSettings, getSessionState, saveSessionState, clearSessionState } from '../lib/storage.js';
import { rescheduleOverdueActivities } from '../lib/reschedule.js';

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
  });

  return result.url || null;
}

async function fetchCompanyWebsiteContent(url) {
  if (!url) return '';
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

  // Click Notes tab first — Odoo renders internal_note_display only after tab activation
  const notesTab = [...document.querySelectorAll('.o_notebook .nav-link, .nav-tabs .nav-link')]
    .find(t => /^notes?$/i.test(t.textContent.trim()));
  if (notesTab) {
    notesTab.click();
    await new Promise(r => setTimeout(r, 600));
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

      const recs = await rpc('sale.order', 'read',
        [[id], ['name', 'partner_id', 'recurrence_id', 'recurring_monthly', 'currency_id',
                'next_invoice_date', 'end_date', 'user_id', 'subscription_state']], {});
      const rec = recs?.[0];
      if (rec) {
        if (rec.partner_id?.[1]) data.customerName = rec.partner_id[1];
        if (rec.name) data.soNumber = rec.name;
        if (rec.recurrence_id?.[1]) data.subscriptionPlan = rec.recurrence_id[1];
        if (rec.recurring_monthly != null) data.recurringAmount = String(rec.recurring_monthly);
        if (rec.currency_id?.[1]) data.currency = rec.currency_id[1];
        if (rec.user_id?.[1]) data.assignedSalesperson = rec.user_id[1];
        if (rec.subscription_state) data.subscriptionState = String(rec.subscription_state).replace(/^\d+_/, '');

        const isoRenewal = rec.next_invoice_date || rec.end_date;
        if (isoRenewal) {
          data.renewalDate = isoRenewal;
          const parts = isoRenewal.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (parts) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const d = new Date(+parts[1], +parts[2] - 1, +parts[3]);
            data.daysUntilRenewal = Math.round((d - today) / 86400000);
          }
        }

        const lines = await rpc('sale.order.line', 'search_read',
          [[['order_id', '=', id], ['display_type', '=', false]]],
          { fields: ['product_id', 'product_uom_qty', 'price_unit'], limit: 30 });
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
  await delay(2000);

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
  await delay(800);

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
  await delay(800);

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
    await delay(1000);
    const appEls = dialog.querySelectorAll('.o_data_row td:first-child, .o_kanban_record .o_module_name, .o_data_row .o_data_cell:first-child');
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
    // Kick off DB utilization in background — broadcasts enrichment when done
    extractDbUtilizationFromTab(tabId).catch(() => {});
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
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

// ── Chatter scroll ───────────────────────────────────────────────────────────

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
async function fetchSalesHistory(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
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
        let partnerId = 0;
        if (currentId) {
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
async function fetchPartnerIntel(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const rpc = async (model, method, args, kwargs) => {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
          });
          const j = await r.json();
          return Array.isArray(j.result) ? j.result : [];
        };

        const soIdFromUrl = parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
        let partnerId = 0;
        if (soIdFromUrl) {
          const so = await rpc('sale.order', 'read', [[soIdFromUrl], ['partner_id', 'commercial_partner_id']], {});
          partnerId = so?.[0]?.commercial_partner_id?.[0] || so?.[0]?.partner_id?.[0] || 0;
        }
        if (!partnerId) {
          const link = document.querySelector('div[name="partner_id"] a[data-id], div[name="partner_id"] a');
          partnerId = parseInt(link?.getAttribute('data-id') || link?.getAttribute('href')?.match(/\/(\d+)(?:\?|$)/)?.[1] || '0');
        }
        if (!partnerId) return null;

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

        return {
          opportunities: leads,
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
      }
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

// ── Deep Intel: Sales History, Tasks, Timesheets via Odoo JSON-RPC ──────────

async function extractDeepIntel(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
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
        let partnerId = 0;
        if (urlId) {
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
async function fetchProjectInfo(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const rpc = (model, method, args, kwargs) => fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { model, method, args, kwargs } })
        }).then(r => r.json()).then(d => Array.isArray(d.result) ? d.result : []);

        const soId = parseInt(window.location.pathname.match(/\/(\d+)\/?$/)?.[1] || '0');
        let partnerId = 0;
        if (soId) {
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
  try {
    broadcast('QUICK_BRIEF_PROGRESS', { status: 'running' });

    const session = await getSessionState(tabId) || {};
    const odooData = session.odooData;
    if (!odooData) {
      broadcast('QUICK_BRIEF_COMPLETE', { success: false, error: 'No customer data' });
      return;
    }

    // Fetch project info (lightweight RPC — runs always, fast)
    const projectInfo = await fetchProjectInfo(tabId);

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
  }
}

async function runResearch(payload) {
  const { tabId, customerName, deepSearch = false } = payload;

  // Step 1: Scroll chatter (sequential — needed before analysis)
  await broadcast('RESEARCH_PROGRESS', { step: 'chatter', status: 'running' });
  const fullChatHistory = await scrollAndExtractChatter(tabId, deepSearch);
  await broadcast('RESEARCH_PROGRESS', { step: 'chatter', status: 'done', count: fullChatHistory.length });

  const session = await getSessionState(tabId) || {};
  if (session.odooData) {
    session.odooData.chatHistory = fullChatHistory;
    await saveSessionState(tabId, session);
  }

  // Steps 2–4: independent collectors — fire simultaneously. Each one catches
  // its own errors and returns a safe default, so Promise.all cannot reject.

  // Sales history via RPC — all company orders + their chatter, no tabs
  const salesHistoryTask = (async () => {
    await broadcast('RESEARCH_PROGRESS', { step: 'sales_history', status: 'running' });
    const result = await fetchSalesHistory(tabId);
    await broadcast('RESEARCH_PROGRESS', {
      step: 'sales_history',
      status: (result.messages.length || result.orders.length) ? 'done' : 'not_found',
      count: result.messages.length
    });
    return result;
  })();

  // Customer 360 — opportunities, invoices, contacts (cheap RPC, runs always)
  const partnerIntelTask = (async () => {
    await broadcast('RESEARCH_PROGRESS', { step: 'partner_intel', status: 'running' });
    const intel = await fetchPartnerIntel(tabId);
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
    const intel = await extractDeepIntel(tabId);
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
    { orders: previousOrders, messages: salesHistoryMessages },
    partnerIntel,
    websiteText,
    deepIntel
  ] = await Promise.all([salesHistoryTask, partnerIntelTask, websiteTask, deepIntelTask]);

  const researchData = {
    websiteText,
    chatHistory: fullChatHistory,
    salesHistory: salesHistoryMessages,
    previousOrders,
    partnerIntel,
    deepIntel
  };

  // Persist and update odooData with sales history
  const updated = await getSessionState(tabId) || {};
  if (updated.odooData) updated.odooData.salesHistory = salesHistoryMessages;
  await saveSessionState(tabId, { ...updated, researchData });

  await broadcast('RESEARCH_COMPLETE', { researchData });
}

// ── Analysis phase ───────────────────────────────────────────────────────────

async function runAnalysis(payload) {
  const { tabId, odooData, researchData } = payload;

  const running = await ollamaAvailable();
  if (!running) {
    await broadcast('ANALYSIS_COMPLETE', {
      success: false,
      error: 'Local Ollama server unreachable. Check the server URL in Settings (⚙) or contact IT.'
    });
    return;
  }

  await broadcast('ANALYSIS_PROGRESS', { step: 'profile', status: 'running' });

  let companyProfile = {};
  try {
    const profileJson = await ollamaChat(
      [
        { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
        { role: 'user', content: buildResearchPrompt(odooData.customerName, researchData.websiteText) }
      ],
      'quick_brief',
      () => {}
    );
    companyProfile = extractJsonObject(profileJson)
      || { summary: 'Web research not available — proceeding with subscription data only.' };
  } catch {
    companyProfile = { summary: 'Web research not available — proceeding with subscription data only.' };
  }

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

  let planText = '';
  // Streaming emits per-token deltas — throttle broadcasts so the panel
  // repaints smoothly instead of re-rendering hundreds of times per second
  let lastPlanBroadcast = 0;
  try {
    await ollamaChat(
      [
        { role: 'system', content: ACTION_PLAN_SYSTEM_PROMPT },
        { role: 'user', content: buildActionPlanPrompt(enrichedOdooData, companyProfile, researchData) }
      ],
      'analysis',
      (chunk, accumulated) => {
        planText = accumulated;
        const now = Date.now();
        if (now - lastPlanBroadcast >= 150) {
          lastPlanBroadcast = now;
          broadcast('ANALYSIS_PROGRESS', { step: 'plan', chunk, accumulated });
        }
      }
    );
  } catch (err) {
    await broadcast('ANALYSIS_COMPLETE', { success: false, error: `Plan generation failed: ${err.message}`, companyProfile, planText: '', activities: [] });
    return;
  }

  if (!planText || planText.trim().length < 50) {
    await broadcast('ANALYSIS_COMPLETE', { success: false, error: 'The model returned an empty response. Check the model name in Settings and that the Ollama server is healthy.', companyProfile, planText: '', activities: [] });
    return;
  }

  const activities = parseActivitiesFromPlan(planText);
  const session = await getSessionState(tabId) || {};
  await saveSessionState(tabId, { ...session, companyProfile, planText, activities });

  await broadcast('ANALYSIS_COMPLETE', { success: true, companyProfile, planText, activities });
}

// ── Activity creation ────────────────────────────────────────────────────────

async function runActivityCreation(payload) {
  const { tabId, activities } = payload;
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
    const creationResults = results?.[0]?.result || [];
    for (const r of creationResults) await broadcast('ACTIVITY_PROGRESS', r);
    await broadcast('ACTIVITY_COMPLETE', { results: creationResults });
    await clearSessionState(tabId);
  } catch (err) {
    // Surface error so panel can show it
    await broadcast('ACTIVITY_COMPLETE', { success: false, error: err.message, results: [] });
  }
}

// ── Extension icon click ─────────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// ── Portfolio Scanner ─────────────────────────────────────────────────────────

async function runPortfolioScan({ tabId }) {
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

    // Step 2: Fetch chatter messages in batches of 40
    const allIds = subs.map(s => s.id);
    let allMessages = [];
    const batchSize = 40;

    for (let i = 0; i < Math.min(allIds.length, 120); i += batchSize) {
      const batchIds = allIds.slice(i, i + batchSize);
      const msgsResult = await chrome.scripting.executeScript({
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
      });
      allMessages = allMessages.concat(msgsResult?.[0]?.result || []);
      broadcast('PORTFOLIO_PROGRESS', { step: 'fetch_msgs', status: 'running',
        label: `Loading chatter… (${allMessages.length} messages)` });
    }

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

    // Step 4: AI analysis
    broadcast('PORTFOLIO_PROGRESS', { step: 'analyze', status: 'running', label: 'AI analyzing portfolio…' });

    const prompt = buildPortfolioPrompt(profiles);
    const messages = [
      { role: 'system', content: PORTFOLIO_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ];

    let fullText = '';
    let lastPortfolioBroadcast = 0;
    await ollamaChat(messages, 'portfolio', (chunk, accumulated) => {
      fullText = accumulated;
      const now = Date.now();
      if (now - lastPortfolioBroadcast >= 150) {
        lastPortfolioBroadcast = now;
        broadcast('PORTFOLIO_PROGRESS', { step: 'analyze', status: 'running',
          label: 'AI analyzing…', accumulated });
      }
    });

    broadcast('PORTFOLIO_COMPLETE', { success: true, planText: fullText, profileCount: profiles.length });

  } catch (err) {
    broadcast('PORTFOLIO_COMPLETE', { success: false, error: err.message });
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
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
          const available = await ollamaAvailable();
          const models = available ? await ollamaModels() : [];
          sendResponse({ success: true, data: { available, models } });
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
            const result = await rescheduleOverdueActivities(msg.payload.baseUrl, msg.payload.maxPerDay, msg.payload.includeToday ?? true);
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

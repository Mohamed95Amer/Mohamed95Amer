import { aiAvailable, aiChat, hasAiKey, providerLabel } from '../lib/ai.js';
import {
  getSettings, saveSettings, getSessionState, saveSessionState, clearSessionState,
  getLearnings, addLearning, deleteLearning, getFeedbackLog, addFeedback,
  getPlaybook, addPlaybookStory, deletePlaybookStory
} from '../lib/storage.js';
import {
  CHURN_SYSTEM_PROMPT, buildChurnPrompt, parseStepsFromPlan,
  EMAIL_SYSTEM_PROMPT, buildEmailPrompt,
  DISTILL_SYSTEM_PROMPT, buildDistillPrompt,
  PLAYBOOK_DISTILL_SYSTEM_PROMPT, buildStoryDistillPrompt
} from '../lib/prompts.js';

const SCRAPER_FILE = 'content/odoo-scraper.js';

// ── Broadcast to side panel ──────────────────────────────────────────────────
async function broadcast(type, payload) {
  // Fails only when the side panel is closed (no receiver) — safe to ignore, but
  // log so genuine messaging bugs aren't invisible.
  try { await chrome.runtime.sendMessage({ type, payload }); }
  catch (e) { if (!/receiving end does not exist/i.test(e?.message || '')) console.warn('broadcast failed', type, e); }
}

// ── Inject the shared scraper (single source of truth for Odoo selectors) ──────
async function injectScraper(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: [SCRAPER_FILE] });
}

// ── Tab load helper ───────────────────────────────────────────────────────────
function waitForTabLoad(tabId, timeoutMs = 12000) {
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

// ── Page data extraction ──────────────────────────────────────────────────────
async function extractPageData(tabId) {
  try {
    await injectScraper(tabId);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__churn.extractPageData()
    });
    const data = results?.[0]?.result;
    if (!data) throw new Error('Could not read page — make sure you are on a subscription page.');
    await saveSessionState(tabId, { odooData: data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Full chatter scroll + extract ─────────────────────────────────────────────
async function scrollAndExtractChatter(tabId) {
  try {
    await injectScraper(tabId);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__churn.scrollAndExtractChatter()
    });
    return results?.[0]?.result || [];
  } catch (err) {
    console.warn('scrollAndExtractChatter failed', err);
    return [];
  }
}

// ── Sales history fetcher ──────────────────────────────────────────────────────
// Returns { messages, error }. `error` is set only on a genuine failure so the
// caller can distinguish "no previous cycles" from "the scrape blew up".
async function fetchSalesHistory(tabId, fallbackUrl) {
  try {
    await injectScraper(tabId);
    const ref = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__churn.findSalesHistoryHref()
    });

    const historyUrl = ref?.[0]?.result || fallbackUrl;
    if (!historyUrl) return { messages: [], error: null };

    const listTab = await chrome.tabs.create({ url: historyUrl, active: false });
    await waitForTabLoad(listTab.id, 12000);
    await new Promise(r => setTimeout(r, 1500));

    await injectScraper(listTab.id);
    const linkResults = await chrome.scripting.executeScript({
      target: { tabId: listTab.id },
      func: () => window.__churn.collectRenewedOrderLinks()
    });

    await chrome.tabs.remove(listTab.id).catch(() => {});
    const orderEntries = linkResults?.[0]?.result || [];
    if (!orderEntries.length) return { messages: [], error: null };

    const allMessages = [];
    for (const { href, label } of orderEntries) {
      try {
        const orderTab = await chrome.tabs.create({ url: href, active: false });
        await waitForTabLoad(orderTab.id, 12000);
        await new Promise(r => setTimeout(r, 1500));
        const msgs = await scrollAndExtractChatter(orderTab.id);
        msgs.forEach(m => { if (label) m.sourceOrder = label; });
        allMessages.push(...msgs);
        await chrome.tabs.remove(orderTab.id).catch(() => {});
      } catch { /* skip a single failed order, keep going */ }
    }

    return { messages: allMessages, error: null };
  } catch (err) {
    console.warn('fetchSalesHistory failed', err);
    return { messages: [], error: err.message || 'Could not load previous subscription history' };
  }
}

// ── AI gate ────────────────────────────────────────────────────────────────────
// Returns a user-facing error string if AI use is blocked (no key / no consent),
// or null if it's cleared to run. Consent is required because record data — incl.
// internal CSM notes — leaves the browser for the selected AI provider.
async function aiGateError() {
  const label = await providerLabel();
  if (!(await hasAiKey())) {
    return `${label} API key not set — open Settings (⚙) to add your key.`;
  }
  const { aiConsent } = await getSettings();
  if (!aiConsent) {
    return `Consent required — this sends the subscription record (including internal notes) to ${label}. Open Settings (⚙) and accept to continue.`;
  }
  return null;
}

// ── Main analysis runner ───────────────────────────────────────────────────────
async function runAnalysis(payload) {
  const { tabId } = payload;

  // Gate before scraping anything — no point loading data we can't process.
  const gate = await aiGateError();
  if (gate) { await broadcast('ANALYSIS_COMPLETE', { success: false, error: gate }); return; }

  // Step 1: Scroll full chatter
  await broadcast('ANALYSIS_PROGRESS', { step: 'chatter', status: 'running', label: 'Loading full chatter history…' });
  const fullChat = await scrollAndExtractChatter(tabId);
  await broadcast('ANALYSIS_PROGRESS', { step: 'chatter', status: fullChat.length ? 'done' : 'error', count: fullChat.length });

  // Step 2: Sales history
  await broadcast('ANALYSIS_PROGRESS', { step: 'sales', status: 'running', label: 'Loading previous subscription history…' });
  const session = await getSessionState(tabId) || {};
  const odooData = session.odooData || {};
  const { messages: salesHistory, error: salesError } = await fetchSalesHistory(tabId, odooData.salesHistoryUrl || '');
  await broadcast('ANALYSIS_PROGRESS', {
    step: 'sales',
    status: salesError ? 'error' : 'done',
    count: salesHistory.length,
    label: salesError ? `Previous history unavailable — ${salesError}` : undefined
  });

  // Merge data
  const enrichedData = { ...odooData, chatHistory: fullChat, salesHistory };
  await saveSessionState(tabId, { ...session, odooData: enrichedData });

  // Step 3: AI analysis (streaming) — with any learned rules injected.
  await generatePlan(tabId, enrichedData, session, '');
}

// Runs (or re-runs) the AI diagnosis over already-scraped data. Shared by the
// full analysis and the "correct & regenerate" loop. `correction` is a free-text
// instruction from the CSM for THIS account; learnings are the cross-account rules.
async function generatePlan(tabId, enrichedData, session, correction = '') {
  const learnings = await getLearnings();
  const playbook  = await getPlaybook();
  await broadcast('ANALYSIS_PROGRESS', {
    step: 'ai', status: 'running',
    label: correction ? 'Re-analyzing with your correction…' : 'AI analyzing churn signals…'
  });

  let planText = '';
  try {
    await aiChat(
      [
        { role: 'system', content: CHURN_SYSTEM_PROMPT },
        { role: 'user', content: buildChurnPrompt(enrichedData, { learnings, correction, playbook }) }
      ],
      (chunk, accumulated) => {
        planText = accumulated;
        broadcast('ANALYSIS_PROGRESS', { step: 'ai', status: 'running', accumulated });
      }
    );
  } catch (err) {
    await broadcast('ANALYSIS_COMPLETE', { success: false, error: `AI analysis failed: ${err.message}` });
    return;
  }

  if (!planText || planText.trim().length < 50) {
    await broadcast('ANALYSIS_COMPLETE', { success: false, error: 'The AI returned an empty response — check your API key in Settings.' });
    return;
  }

  const steps = parseStepsFromPlan(planText);
  await saveSessionState(tabId, { ...session, odooData: enrichedData, planText, steps });
  await broadcast('ANALYSIS_COMPLETE', {
    success: true, planText, steps,
    learningsApplied: learnings.length,
    playbookApplied: playbook.length
  });
}

// ── Correct & regenerate ────────────────────────────────────────────────────────
// Re-runs the AI on the SAME scraped data with the CSM's correction — no re-scrape,
// so it's fast. This is the per-account self-correction loop.
async function regenerateAnalysis(payload) {
  const { tabId, correction } = payload;
  const gate = await aiGateError();
  if (gate) { await broadcast('ANALYSIS_COMPLETE', { success: false, error: gate }); return; }

  const session = await getSessionState(tabId) || {};
  const enrichedData = session.odooData;
  if (!enrichedData || !Object.keys(enrichedData).length) {
    await broadcast('ANALYSIS_COMPLETE', { success: false, error: 'No prior analysis to refine — run a full analysis first.' });
    return;
  }
  await generatePlan(tabId, enrichedData, session, (correction || '').trim());
}

// ── Feedback + learning ─────────────────────────────────────────────────────────
// Distills a raw correction into ONE reusable, account-agnostic rule via a small
// AI call. Falls back to storing the raw text if AI is unavailable.
async function distillLearning(text, context) {
  const raw = (text || '').trim();
  if (await aiGateError()) return raw.slice(0, 220);
  try {
    let out = '';
    await aiChat(
      [
        { role: 'system', content: DISTILL_SYSTEM_PROMPT },
        { role: 'user', content: buildDistillPrompt(raw, context) }
      ],
      (chunk, accumulated) => { out = accumulated; }
    );
    const cleaned = (out || raw).trim().replace(/^["'\s]+|["'\s]+$/g, '');
    return cleaned.slice(0, 240) || raw.slice(0, 220);
  } catch {
    return raw.slice(0, 220);
  }
}

async function submitFeedback(payload) {
  const { rating = null, text = '', saveAsLearning = false, account = '', context = {} } = payload;

  // Always log the raw feedback (thumbs + free text) for later review.
  await addFeedback({
    id: `fb_${Date.now()}`,
    timestamp: new Date().toISOString(),
    account, rating,
    text: text.trim(),
    context
  });

  let learnings = await getLearnings();
  let learningText = '';
  if (saveAsLearning && text.trim()) {
    learningText = await distillLearning(text, context);
    learnings = await addLearning({
      id: `ln_${Date.now()}`,
      text: learningText,
      createdAt: new Date().toISOString(),
      sourceAccount: account,
      raw: text.trim().slice(0, 500)
    });
  }
  return { success: true, learnings, learningText };
}

// ── Success-story playbook ──────────────────────────────────────────────────────
// Distills a retention win into a one-line "why it worked" lesson. Falls back to
// no lesson (the story itself is still stored) if AI is unavailable.
async function distillStory(story) {
  if (await aiGateError()) return '';
  try {
    let out = '';
    await aiChat(
      [
        { role: 'system', content: PLAYBOOK_DISTILL_SYSTEM_PROMPT },
        { role: 'user', content: buildStoryDistillPrompt(story) }
      ],
      (chunk, accumulated) => { out = accumulated; }
    );
    return (out || '').trim().replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 260);
  } catch {
    return '';
  }
}

async function saveSuccessStory(payload) {
  const story = {
    id: `ps_${Date.now()}`,
    createdAt: new Date().toISOString(),
    accountName:   (payload.accountName || '').trim().slice(0, 120),
    churnCategory: (payload.churnCategory || 'Unknown').trim().slice(0, 40),
    situation:     (payload.situation || '').trim().slice(0, 600),
    actions:       (payload.actions || '').trim().slice(0, 900),
    outcome:       (payload.outcome || '').trim().slice(0, 600),
    keyLesson:     '',
    raw: [payload.situation, payload.actions, payload.outcome].filter(Boolean).join('\n').slice(0, 1500)
  };
  if (!story.situation && !story.actions) {
    return { success: false, error: 'Tell me at least the situation or what you did — that is the play.' };
  }
  story.keyLesson = await distillStory(story);
  const playbook = await addPlaybookStory(story);
  return { success: true, playbook, story };
}

// ── Email draft ───────────────────────────────────────────────────────────────
async function runEmailDraft(payload) {
  const { tabId, userNote, correction = '' } = payload;

  const gate = await aiGateError();
  if (gate) { await broadcast('EMAIL_DRAFT_COMPLETE', { success: false, error: gate }); return; }

  const session = await getSessionState(tabId) || {};
  const odooData = session.odooData || {};
  const planText = session.planText || '';
  const settings = await getSettings();
  const signature = settings.emailSignature || '';
  const learnings = await getLearnings();
  const playbook  = await getPlaybook();

  let emailText = '';
  try {
    await aiChat(
      [
        { role: 'system', content: EMAIL_SYSTEM_PROMPT },
        { role: 'user',   content: buildEmailPrompt(odooData, planText, userNote, signature, { learnings, correction: correction.trim(), playbook }) }
      ],
      (chunk, accumulated) => {
        emailText = accumulated;
        broadcast('EMAIL_DRAFT_PROGRESS', { accumulated });
      }
    );
  } catch (err) {
    await broadcast('EMAIL_DRAFT_COMPLETE', { success: false, error: `Email generation failed: ${err.message}` });
    return;
  }

  if (!emailText || emailText.trim().length < 30) {
    await broadcast('EMAIL_DRAFT_COMPLETE', { success: false, error: 'The AI returned an empty response.' });
    return;
  }

  await broadcast('EMAIL_DRAFT_COMPLETE', { success: true, emailText });
}

// ── Icon click ────────────────────────────────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// ── URL navigation detection ──────────────────────────────────────────────────
const ODOO_PATTERN = /odoo\.com|localhost|127\.0\.0\.1/;
const SO_PATTERN   = /sale\.order|\/sales\/|\/subscriptions\/|[#&]model=sale/;
let navDebounceTimer = null;

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (!ODOO_PATTERN.test(url) || !SO_PATTERN.test(url)) return;
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    navDebounceTimer = null;
    broadcast('PAGE_NAVIGATED', { tabId, url });
  }, 1500);
});

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'EXTRACT_PAGE_DATA': {
          const result = await extractPageData(msg.payload.tabId);
          sendResponse(result);
          break;
        }
        case 'START_ANALYSIS': {
          runAnalysis(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'REGENERATE_ANALYSIS': {
          regenerateAnalysis(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'SUBMIT_FEEDBACK': {
          const result = await submitFeedback(msg.payload);
          sendResponse(result);
          break;
        }
        case 'GET_LEARNINGS': {
          const learnings = await getLearnings();
          sendResponse({ success: true, data: learnings });
          break;
        }
        case 'DELETE_LEARNING': {
          const learnings = await deleteLearning(msg.payload.id);
          sendResponse({ success: true, data: learnings });
          break;
        }
        case 'GET_FEEDBACK_LOG': {
          const log = await getFeedbackLog();
          sendResponse({ success: true, data: log });
          break;
        }
        case 'SAVE_SUCCESS_STORY': {
          const result = await saveSuccessStory(msg.payload);
          sendResponse(result);
          break;
        }
        case 'GET_PLAYBOOK': {
          const playbook = await getPlaybook();
          sendResponse({ success: true, data: playbook });
          break;
        }
        case 'DELETE_STORY': {
          const playbook = await deletePlaybookStory(msg.payload.id);
          sendResponse({ success: true, data: playbook });
          break;
        }
        case 'GET_SETTINGS': {
          const s = await getSettings();
          sendResponse({ success: true, data: s });
          break;
        }
        case 'SAVE_SETTINGS': {
          await saveSettings(msg.payload);
          sendResponse({ success: true });
          break;
        }
        case 'CHECK_GEMINI': {
          const available = await aiAvailable();
          sendResponse({ success: true, data: { available } });
          break;
        }
        case 'GET_SESSION': {
          const state = await getSessionState(msg.payload.tabId);
          sendResponse({ success: true, data: state });
          break;
        }
        case 'DRAFT_EMAIL': {
          runEmailDraft(msg.payload);
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ success: false, error: `Unknown: ${msg.type}` });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

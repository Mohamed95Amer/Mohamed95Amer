import { DEFAULT_OLLAMA_URL, DEFAULT_SMART_MODEL, DEFAULT_FAST_MODEL } from './config.js';

// Endpoint allowlist — every prompt carries customer PII and financials, so the
// Ollama URL must stay on the intranet. A typo'd (or storage.sync-propagated)
// public host would silently bulk-exfiltrate the book of business.
export function validateOllamaUrl(url) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, reason: 'Not a valid URL' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'Must be http(s)' };
  const h = u.hostname;
  const isPrivate =
    h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /\.(local|internal|lan|corp|intranet)$/i.test(h) ||
    (!h.includes('.') && h !== '');           // bare intranet hostname
  if (!isPrivate) {
    return { ok: false, reason: `"${h}" is not a private/intranet host. Customer data is sent to this URL — it must stay on the company network.` };
  }
  return { ok: true };
}

export async function getSettings() {
  const defaults = {
    ollamaUrl:        DEFAULT_OLLAMA_URL,
    ollamaModel:      DEFAULT_SMART_MODEL,   // smart tier — action plans, portfolio analysis
    ollamaModelFast:  DEFAULT_FAST_MODEL,    // fast tier — quick briefs, JSON extraction
    deepSearch:       false,
    feedbackFormUrl:  '',
    feedbackUserName: ''
  };
  const stored = await chrome.storage.sync.get([
    'ollamaUrl', 'ollamaModel', 'ollamaModelFast', 'deepSearch', 'feedbackFormUrl', 'feedbackUserName'
  ]);
  return { ...defaults, ...stored };
}

export async function saveSettings({ ollamaUrl, ollamaModel, ollamaModelFast, deepSearch, feedbackFormUrl, feedbackUserName }) {
  const toSet = {};
  if (ollamaUrl !== undefined && ollamaUrl) {
    const v = validateOllamaUrl(ollamaUrl);
    if (!v.ok) throw new Error(`Ollama URL rejected: ${v.reason}`);
  }
  if (ollamaUrl        !== undefined) toSet.ollamaUrl        = ollamaUrl       || DEFAULT_OLLAMA_URL;
  if (ollamaModel      !== undefined) toSet.ollamaModel      = ollamaModel     || DEFAULT_SMART_MODEL;
  if (ollamaModelFast  !== undefined) toSet.ollamaModelFast  = ollamaModelFast || DEFAULT_FAST_MODEL;
  if (deepSearch       !== undefined) toSet.deepSearch       = !!deepSearch;
  if (feedbackFormUrl  !== undefined) toSet.feedbackFormUrl  = feedbackFormUrl  || '';
  if (feedbackUserName !== undefined) toSet.feedbackUserName = feedbackUserName || '';
  await chrome.storage.sync.set(toSet);
}

export async function getSessionState(tabId) {
  const key = `session_${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] || null;
}

export async function saveSessionState(tabId, state) {
  const key = `session_${tabId}`;
  await chrome.storage.session.set({ [key]: state });
}

export async function clearSessionState(tabId) {
  await chrome.storage.session.remove(`session_${tabId}`);
}

// Portfolio reports are minutes of GPU work — persist them so closing the
// panel doesn't discard the scan. storage.session: survives panel close,
// cleared on browser restart (the data goes stale anyway).
export async function savePortfolioResult(result) {
  await chrome.storage.session.set({ portfolio_result: { ...result, generatedAt: Date.now() } });
}

export async function getPortfolioResult() {
  const r = await chrome.storage.session.get('portfolio_result');
  return r.portfolio_result || null;
}

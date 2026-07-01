const SETTINGS_KEY = 'churn_settings';
const SESSION_PREFIX = 'churn_session_';
const SETTINGS_KEYS = ['geminiApiKey', 'geminiModel', 'emailSignature', 'aiConsent'];

// The Gemini API key and record data must NOT sync across a user's devices, so
// everything lives in chrome.storage.local (device-only), never storage.sync.
// storage.sync would replicate the plaintext key to every machine on the Chrome
// profile. This migrates any key left behind by the old storage.sync version.
let migrated = false;
async function migrateFromSync() {
  if (migrated) return;
  migrated = true;
  try {
    const sync = await chrome.storage.sync.get([SETTINGS_KEY, ...SETTINGS_KEYS]);
    const local = await chrome.storage.local.get(SETTINGS_KEYS);
    const patch = {};
    for (const k of SETTINGS_KEYS) {
      const fromSync = sync[k] ?? sync[SETTINGS_KEY]?.[k];
      if (local[k] === undefined && fromSync !== undefined) patch[k] = fromSync;
    }
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
    // Purge the sensitive key from sync so it stops replicating.
    if (sync.geminiApiKey !== undefined || sync[SETTINGS_KEY]?.geminiApiKey) {
      await chrome.storage.sync.remove(['geminiApiKey', SETTINGS_KEY]);
    }
  } catch { /* storage.sync may be unavailable; local is the source of truth */ }
}

export async function getSettings() {
  await migrateFromSync();
  const r = await chrome.storage.local.get(SETTINGS_KEYS);
  return {
    geminiApiKey:   r.geminiApiKey   || '',
    geminiModel:    r.geminiModel    || 'gemini-2.5-flash',
    emailSignature: r.emailSignature || '',
    aiConsent:      r.aiConsent === true
  };
}

export async function saveSettings(data) {
  const patch = {
    geminiApiKey:   data.geminiApiKey || '',
    geminiModel:    data.geminiModel || 'gemini-2.5-flash',
    emailSignature: data.emailSignature || ''
  };
  if (data.aiConsent !== undefined) patch.aiConsent = data.aiConsent === true;
  return chrome.storage.local.set(patch);
}

export async function getSessionState(tabId) {
  return new Promise(resolve =>
    chrome.storage.session.get([SESSION_PREFIX + tabId], (r) => resolve(r[SESSION_PREFIX + tabId] || null))
  );
}

export async function saveSessionState(tabId, data) {
  return new Promise(resolve =>
    chrome.storage.session.set({ [SESSION_PREFIX + tabId]: data }, resolve)
  );
}

export async function clearSessionState(tabId) {
  return new Promise(resolve =>
    chrome.storage.session.remove([SESSION_PREFIX + tabId], resolve)
  );
}

export async function getSettings() {
  const defaults = {
    ollamaUrl:        'http://10.100.255.200:11434',
    ollamaModel:      'qwen3.6:latest',   // smart tier — action plans, portfolio analysis
    ollamaModelFast:  'llama3.2:latest',  // fast tier — quick briefs, JSON extraction
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
  if (ollamaUrl        !== undefined) toSet.ollamaUrl        = ollamaUrl       || 'http://10.100.255.200:11434';
  if (ollamaModel      !== undefined) toSet.ollamaModel      = ollamaModel     || 'qwen3.6:latest';
  if (ollamaModelFast  !== undefined) toSet.ollamaModelFast  = ollamaModelFast || 'llama3.2:latest';
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

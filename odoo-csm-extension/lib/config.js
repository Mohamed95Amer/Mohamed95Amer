// Single source of truth for the intranet defaults that were previously
// duplicated as literals across storage.js, ollama.js, and app.js.
//
// NOTE: manifest.json cannot import this (host_permissions is static JSON).
// If IT moves the Ollama server, the manifest host_permissions entry must
// still be updated — OR rely on the runtime optional-permission request the
// Settings screen now performs when the URL changes (see app.js saveSettings).

export const DEFAULT_OLLAMA_URL  = 'http://10.100.255.200:11434';
export const DEFAULT_SMART_MODEL = 'qwen3.6:latest';   // action plans, portfolio
export const DEFAULT_FAST_MODEL  = 'llama3.2:latest';  // quick briefs, JSON extraction

// Hosts the packaged manifest already grants (kept in sync with manifest.json
// host_permissions). Used to detect the "URL changed but no permission" trap.
export const MANIFEST_GRANTED_HOSTS = [
  'http://10.100.255.200/*',
  'http://localhost/*',
  'http://127.0.0.1/*'
];

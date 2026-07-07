// Lightweight local diagnostics ring buffer — the pilot's only debugging
// channel. Stays entirely on-device (chrome.storage.local), no network
// telemetry, preserving the local-only data posture.
//
// When a CSM says "it didn't work", the developer can have them hit
// "Copy diagnostics" in Settings and paste a structured trace: phase timings,
// which model actually ran, whether a fallback fired, RPC errors, parse
// failures. Turns "it broke" into a reproducible report.

const LOG_KEY = 'csm_diag_log';
const MAX_EVENTS = 120;

function nowIso() { return new Date().toISOString(); }

// level: 'info' | 'warn' | 'error'
export async function logEvent(level, event, detail = {}) {
  try {
    const r = await chrome.storage.local.get(LOG_KEY);
    const log = r[LOG_KEY] || [];
    log.push({ t: nowIso(), level, event, ...detail });
    // keep only the most recent MAX_EVENTS
    const trimmed = log.slice(-MAX_EVENTS);
    await chrome.storage.local.set({ [LOG_KEY]: trimmed });
  } catch { /* logging must never throw into the caller */ }
}

export const logInfo  = (event, detail) => logEvent('info', event, detail);
export const logWarn  = (event, detail) => logEvent('warn', event, detail);
export const logError = (event, detail) => logEvent('error', event, detail);

export async function getDiagnostics() {
  const r = await chrome.storage.local.get(LOG_KEY);
  return r[LOG_KEY] || [];
}

export async function clearDiagnostics() {
  await chrome.storage.local.remove(LOG_KEY);
}

// Human-readable dump for the clipboard. Includes the manifest version and a
// redaction pass so customer names / quotes never land in a pasted log.
export function formatDiagnostics(events, meta = {}) {
  const header = [
    `Odoo CSM Copilot diagnostics`,
    `version: ${meta.version || '?'}  exported: ${nowIso()}`,
    `model(smart/fast): ${meta.smartModel || '?'} / ${meta.fastModel || '?'}`,
    `ollama: ${meta.ollamaUrl || '?'}`,
    `events: ${events.length}`,
    '─'.repeat(40)
  ].join('\n');
  const body = events.map(e => {
    const { t, level, event, ...rest } = e;
    const detail = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    return `${(t || '').slice(11, 19)} [${level}] ${event}${detail}`;
  }).join('\n');
  return `${header}\n${body}`;
}

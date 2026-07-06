import { getSettings } from './storage.js';

// Anthropic Messages API client (raw fetch — no bundler in this extension).
// The anthropic-dangerous-direct-browser-access header opts in to CORS browser
// access; the key is sent in the x-api-key header, never in the URL.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

async function getCreds() {
  const { anthropicApiKey, anthropicModel } = await getSettings();
  return { anthropicApiKey, anthropicModel };
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

// Splits our provider-neutral message list into Anthropic's shape:
// top-level `system` string + alternating user/assistant `messages`.
function toAnthropicBody(messages, { maxTokens, stream }) {
  const systemMsg = messages.find(m => m.role === 'system');
  const turns = messages.filter(m => m.role !== 'system');
  const body = {
    max_tokens: maxTokens,
    messages: turns.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  };
  if (systemMsg) body.system = systemMsg.content;
  if (stream) body.stream = true;
  return body;
  // NOTE: no temperature/top_p/top_k — current Claude models (Opus 4.8,
  // Sonnet 5) reject sampling parameters with a 400.
}

export async function anthropicAvailable() {
  const { anthropicApiKey, anthropicModel } = await getCreds();
  if (!anthropicApiKey) return false;
  try {
    const body = toAnthropicBody([{ role: 'user', content: 'ping' }], { maxTokens: 8, stream: false });
    body.model = anthropicModel;
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: buildHeaders(anthropicApiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function anthropicChat(messages, onChunk, { maxTokens = 6000 } = {}) {
  const { anthropicApiKey, anthropicModel } = await getCreds();
  if (!anthropicApiKey) throw new Error('Anthropic API key not configured — open Settings to add it.');

  const body = toAnthropicBody(messages, { maxTokens, stream: true });
  body.model = anthropicModel;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: buildHeaders(anthropicApiKey),
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    let msg = `Claude error ${res.status}`;
    try { msg = JSON.parse(err).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  // SSE stream: text arrives as content_block_delta events with text_delta payloads.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let stopReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          fullText += evt.delta.text;
          onChunk(evt.delta.text, fullText);
        } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
          stopReason = evt.delta.stop_reason;
        } else if (evt.type === 'error') {
          throw new Error(evt.error?.message || 'Claude stream error');
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // partial/keep-alive line
        throw e;
      }
    }
  }

  if (stopReason === 'refusal') {
    throw new Error('Claude declined this request (safety refusal) — try rephrasing or switch model in Settings.');
  }

  return fullText;
}

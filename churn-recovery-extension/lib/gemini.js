import { getSettings } from './storage.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function getKey() {
  const { geminiApiKey, geminiModel } = await getSettings();
  return { geminiApiKey, geminiModel };
}

// Cheap, offline check — is a key configured at all? Callers use this instead of
// geminiAvailable() before a real request so the request's own error (bad key,
// quota, network) surfaces verbatim rather than being flattened to "key not set".
export async function hasGeminiKey() {
  const { geminiApiKey } = await getKey();
  return !!geminiApiKey;
}

function getGenerationConfig(isTest = false) {
  return {
    temperature: 0.3,
    maxOutputTokens: isTest ? 50 : 6000,
    thinkingConfig: { thinkingBudget: 0 }
  };
}

export async function geminiAvailable() {
  const { geminiApiKey, geminiModel } = await getKey();
  if (!geminiApiKey) return false;
  try {
    const r = await fetch(
      `${GEMINI_BASE}/${geminiModel}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: getGenerationConfig(true)
        }),
        signal: AbortSignal.timeout(10000)
      }
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function geminiChat(messages, onChunk) {
  const { geminiApiKey, geminiModel } = await getKey();
  if (!geminiApiKey) throw new Error('Gemini API key not configured — open Settings to add it.');

  const systemMsg = messages.find(m => m.role === 'system');
  const turns = messages.filter(m => m.role !== 'system');

  const body = {
    contents: turns.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    generationConfig: getGenerationConfig()
  };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const res = await fetch(
    `${GEMINI_BASE}/${geminiModel}:streamGenerateContent?key=${geminiApiKey}&alt=sse`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    let msg = `Gemini error ${res.status}`;
    try { msg = JSON.parse(err).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) { fullText += text; onChunk(text, fullText); }
      } catch {}
    }
  }

  return fullText;
}

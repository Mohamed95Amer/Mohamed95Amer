import { getSettings } from './storage.js';
import { geminiChat, geminiAvailable } from './gemini.js';
import { anthropicChat, anthropicAvailable } from './anthropic.js';

// Provider dispatcher — the rest of the extension talks to aiChat/aiAvailable/
// hasAiKey and never cares whether Gemini or Anthropic Claude is behind it.
// The provider is a Settings choice (`aiProvider`).

export async function getProvider() {
  const { aiProvider } = await getSettings();
  return aiProvider === 'anthropic' ? 'anthropic' : 'gemini';
}

export async function hasAiKey() {
  const s = await getSettings();
  return s.aiProvider === 'anthropic' ? !!s.anthropicApiKey : !!s.geminiApiKey;
}

export async function aiAvailable() {
  return (await getProvider()) === 'anthropic' ? anthropicAvailable() : geminiAvailable();
}

export async function aiChat(messages, onChunk) {
  return (await getProvider()) === 'anthropic'
    ? anthropicChat(messages, onChunk)
    : geminiChat(messages, onChunk);
}

export async function providerLabel() {
  return (await getProvider()) === 'anthropic' ? 'Anthropic Claude' : 'Google Gemini';
}

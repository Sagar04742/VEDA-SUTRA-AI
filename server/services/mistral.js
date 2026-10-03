import { Mistral } from '@mistralai/mistralai';

// Title used when Mistral is unavailable: the first 40 characters of the message.
export function fallbackTitle(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= 40 ? t || 'New chat' : t.slice(0, 40).trimEnd();
}

// Make whatever the model returned safe to show: one line, no quotes, at most 5 words.
export function cleanTitle(raw) {
  const line = String(raw ?? '').split('\n').find((l) => l.trim()) ?? '';
  const words = line
    .replace(/^\s*(title\s*:)\s*/i, '')
    .replace(/["'“”‘’`*#_]/g, '')
    .replace(/[.!?:;,\s]+$/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  return words.join(' ').slice(0, 60);
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('title timeout')), ms))]);

// client is injectable for tests. generateTitle never throws: a title failure must never break a chat.
export function createTitleService({ apiKey, model, client, timeoutMs = 8000 } = {}) {
  let sdk = client;
  const getClient = () => (sdk ??= new Mistral({ apiKey }));

  return {
    async generateTitle(firstMessage) {
      const fallback = fallbackTitle(firstMessage);
      if (!client && (!apiKey || !model)) return fallback;
      try {
        const res = await withTimeout(
          getClient().chat.complete({
            model,
            maxTokens: 24,
            temperature: 0.2,
            messages: [
              { role: 'system', content: 'You write short chat titles. Reply with ONLY the title: at most 5 words, no quotes, no punctuation at the end.' },
              { role: 'user', content: `First message of the chat:\n${String(firstMessage).slice(0, 500)}` },
            ],
          }),
          timeoutMs
        );
        const content = res?.choices?.[0]?.message?.content;
        const text = Array.isArray(content) ? content.map((c) => c.text ?? '').join('') : content;
        return cleanTitle(text) || fallback;
      } catch (err) {
        console.warn('Title generation failed, using fallback:', err.message);
        return fallback;
      }
    },
  };
}

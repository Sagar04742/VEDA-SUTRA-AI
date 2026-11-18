// Chat titles are written by Cohere. If Cohere is unavailable the title is just the first 40 characters,
// because a title problem must never break a chat.

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

const COHERE_URL = 'https://api.cohere.com/v2/chat';

// fetchImpl is injectable for tests. generateTitle never throws.
export function createCohereTitleService({ apiKey, model, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  return {
    async generateTitle(firstMessage) {
      const fallback = fallbackTitle(firstMessage);
      if (!apiKey || !model) return fallback;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(COHERE_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            max_tokens: 24,
            temperature: 0.2,
            messages: [
              { role: 'system', content: 'You write short chat titles. Reply with ONLY the title: at most 5 words, no quotes, no punctuation at the end. Write it in the same language as the message.' },
              { role: 'user', content: `First message of the chat:\n${String(firstMessage).slice(0, 500)}` },
            ],
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Cohere answered ${res.status}`);
        const body = await res.json();
        const text = (body?.message?.content ?? []).map((c) => c.text ?? '').join('');
        return cleanTitle(text) || fallback;
      } catch (err) {
        console.warn('Title generation failed, using fallback:', err.message);
        return fallback;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

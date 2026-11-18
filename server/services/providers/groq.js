import { createOpenAiCompatProvider } from './openaiCompat.js';

// Groq (https://groq.com): very fast hosted open models. OpenAI-compatible API.
// The free plan allows only about 8,000 tokens a minute per model, so roughly one question a minute per model;
// the answer chain then moves on to the next model.
export function createGroqProvider({ apiKey, fetchImpl, reasoningEffort } = {}) {
  return createOpenAiCompatProvider({
    name: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey,
    fetchImpl,
    body: (model) => ({
      temperature: 0.3,
      // gpt-oss models can "think" at different depths; keep the hidden reasoning out of the answer.
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: reasoningEffort ?? 'low', include_reasoning: false } : {}),
    }),
  });
}

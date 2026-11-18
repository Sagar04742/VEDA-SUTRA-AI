import { createOpenAiCompatProvider } from './openaiCompat.js';

// OpenAI (https://platform.openai.com). Reasoning models (the o-series and gpt-5 family) accept only the default
// temperature, so it is sent only to the other models.
const fixedTemperature = (model) => /^(o\d|gpt-5)/.test(model);

export function createOpenAiProvider({ apiKey, fetchImpl } = {}) {
  return createOpenAiCompatProvider({
    name: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey,
    fetchImpl,
    body: (model) => (fixedTemperature(model) ? {} : { temperature: 0.3 }),
  });
}

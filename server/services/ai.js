import { env } from '../config/env.js';
import { createGeminiService } from './gemini.js';
import { createTitleService } from './mistral.js';
import { createMockGeminiClient, createMockMistralClient } from './mockAi.js';

// One object the routes use: { configError(), streamChat(), generateTitle() }.
// AI_MOCK=1 swaps the SDK clients for the dev mock; everything else is the real code path.
export function createAi() {
  const mock = process.env.AI_MOCK === '1';
  const gemini = createGeminiService({
    apiKey: env.gemini.apiKey,
    model: mock ? 'mock' : env.gemini.model,
    client: mock ? createMockGeminiClient() : undefined,
  });
  const titles = createTitleService({
    apiKey: env.mistral.apiKey,
    model: mock ? 'mock' : env.mistral.model,
    client: mock ? createMockMistralClient() : undefined,
  });

  return {
    configError: () => gemini.configError(),
    streamChat: (args) => gemini.streamChat(args),
    generateTitle: (text) => titles.generateTitle(text),
  };
}

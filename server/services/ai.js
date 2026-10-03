import { env } from '../config/env.js';
import { createGeminiService } from './gemini.js';
import { createTitleService } from './mistral.js';
import { createMockGeminiClient, createMockMistralClient } from './mockAi.js';
import { buildTiers, publicTier, DEFAULT_TIER } from '../config/tiers.js';

// One object the routes use: { configError(), streamChat(), generateTitle() }.
// AI_MOCK=1 swaps the SDK clients for the dev mock; everything else is the real code path.
export function createAi() {
  const mock = process.env.AI_MOCK === '1';
  const gemini = createGeminiService({
    apiKey: env.gemini.apiKey,
    model: mock ? 'mock' : env.gemini.model,
    fallbackModel: mock ? undefined : env.gemini.fallbackModel,
    client: mock ? createMockGeminiClient() : undefined,
  });
  const titles = createTitleService({
    apiKey: env.mistral.apiKey,
    model: mock ? 'mock' : env.mistral.model,
    client: mock ? createMockMistralClient() : undefined,
  });

  const tiers = buildTiers(mock ? { model: 'mock' } : env.gemini);

  return {
    configError: () => gemini.configError(),
    tiers: () => tiers.map(publicTier),
    // options.tier picks the level in the model picker: which models to try, and how long the answer should be.
    streamChat: ({ options = {}, ...args }) => {
      const tier = tiers.find((t) => t.id === (options.tier ?? DEFAULT_TIER)) ?? tiers[0];
      return gemini.streamChat({ ...args, models: tier.chain, options: { ...options, style: tier.style } });
    },
    generateTitle: (text) => titles.generateTitle(text),
  };
}

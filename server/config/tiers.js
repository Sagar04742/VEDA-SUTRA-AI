// The three answer "levels" shown in the model picker. Each level has a friendly name, an ordered list of
// models (each on one provider: Gemini, Groq or Mistral) and an answer style. If a level's first model is busy
// or at its free-tier limit, the answer is retried on the next model, then on the levels below, and the user is told.
//
//   Sutra Lite  quick, 1-2 short paragraphs (default)
//   Sutra Plus  clearer, more detail
//   Sutra Pro   most thorough, with examples
//
// Models come from .env, never from code: TIER_LITE / TIER_PLUS / TIER_PRO = "provider:model,provider:model".
// Without them the defaults below are used (built from the per-provider variables).
export const TIER_IDS = ['lite', 'plus', 'pro'];
export const DEFAULT_TIER = 'lite';

const DEFS = {
  lite: { name: 'Sutra Lite', tagline: 'Quick answers in one or two short paragraphs', style: 'brief' },
  plus: { name: 'Sutra Plus', tagline: 'Clearer answers with more detail', style: 'balanced' },
  pro: { name: 'Sutra Pro', tagline: 'Most thorough, with examples and context', style: 'thorough' },
};

// The answer length style of a level (brief | balanced | thorough).
export const tierStyle = (id) => DEFS[id]?.style;

// "groq:openai/gpt-oss-120b" -> { provider: 'groq', id: 'openai/gpt-oss-120b' } (the model id may contain ":" or "/")
export function parseSpec(text) {
  const s = String(text ?? '').trim();
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  return { provider: s.slice(0, i).trim().toLowerCase(), id: s.slice(i + 1).trim() };
}

export const parseSpecList = (text) => String(text ?? '').split(',').map(parseSpec).filter(Boolean);

// Default models per level when TIER_* is not set. Lite is Mistral. Plus and Pro try, in this order: the bigger Gemini
// model (best answers, but only ~20 calls a day on a free key and often overloaded), OpenAI if its key works, then the
// Gemini flash-lite model (measured with Pramana: the most accurate AND reliable free model, about 9.5 out of 10 against
// about 7 for Mistral 14B and 6.5 for gpt-oss-120b), then Groq. So Plus really is better than Lite, even on a bad day.
export function defaultSpecs({ gemini = {}, mistral = {}, groq = {}, openai = {} } = {}) {
  const g = (id) => (id ? [{ provider: 'gemini', id }] : []);
  const m = (id) => (id ? [{ provider: 'mistral', id }] : []);
  const groqModels = (groq.models ?? []).map((id) => ({ provider: 'groq', id }));
  const openaiModels = (openai.apiKey ? openai.models ?? [] : []).map((id) => ({ provider: 'openai', id }));
  return {
    lite: [...m(mistral.model), ...g(gemini.model), ...g(gemini.fallbackModel)],
    plus: [...g(gemini.modelPlus), ...openaiModels, ...g(gemini.model), ...groqModels],
    pro: [...g(gemini.modelPro), ...g(gemini.modelPlus), ...openaiModels, ...g(gemini.model), ...groqModels],
  };
}

// specs = { lite: [{provider,id}], plus: [...], pro: [...] }
// Old shape still accepted: { model, fallbackModel, modelPlus, modelPro } meaning Gemini models only.
export function buildTiers(input) {
  const specs = input.lite || input.plus || input.pro ? input : legacySpecs(input);
  const own = Object.fromEntries(TIER_IDS.map((id) => [id, specs[id] ?? []]));
  const labelFor = (e) => {
    for (const id of TIER_IDS) if (own[id].some((x) => x.provider === e.provider && x.id === e.id)) return DEFS[id].name;
    return undefined;
  };
  // Each level falls back to the ones below it, so the picker always works.
  const lower = { lite: [], plus: ['lite'], pro: ['plus', 'lite'] };
  return TIER_IDS.map((id) => {
    const seen = new Set();
    const chain = [];
    for (const src of [id, ...lower[id]]) {
      for (const e of own[src]) {
        const key = `${e.provider}:${e.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chain.push({ provider: e.provider, id: e.id, label: labelFor(e) });
      }
    }
    return { id, ...DEFS[id], chain };
  });
}

function legacySpecs(g) {
  const gem = (id) => (id ? [{ provider: 'gemini', id }] : []);
  return { lite: [...gem(g.model), ...gem(g.fallbackModel)], plus: gem(g.modelPlus), pro: gem(g.modelPro) };
}

// What the browser is allowed to see.
export const publicTier = (t) => ({ id: t.id, name: t.name, tagline: t.tagline, model: t.chain[0]?.id ?? null, provider: t.chain[0]?.provider ?? null });

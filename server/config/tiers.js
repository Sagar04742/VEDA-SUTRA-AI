// The three answer "levels" shown in the model picker. Each level has a friendly name, a Gemini model
// (from .env, never hardcoded here) and an answer style. If a level's model is busy or at its free-tier
// limit, the answer is retried on the next model down the chain, and the user is told.
//
//   Sutra Lite  GEMINI_MODEL                 quick, 1-2 short paragraphs (default)
//   Sutra Plus  GEMINI_MODEL_PLUS            clearer, more detail
//   Sutra Pro   GEMINI_MODEL_PRO             most thorough, with examples
//
// A level whose model is not set simply uses the next one down, so the picker always works.
export const TIER_IDS = ['lite', 'plus', 'pro'];
export const DEFAULT_TIER = 'lite';

const DEFS = {
  lite: { name: 'Sutra Lite', tagline: 'Quick answers in one or two short paragraphs', style: 'brief' },
  plus: { name: 'Sutra Plus', tagline: 'Clearer answers with more detail', style: 'balanced' },
  pro: { name: 'Sutra Pro', tagline: 'Most thorough, with examples and context', style: 'thorough' },
};

// gemini = { model, fallbackModel, modelPlus, modelPro } (all optional except model)
export function buildTiers(gemini) {
  const own = { lite: gemini.model, plus: gemini.modelPlus, pro: gemini.modelPro };
  const labelFor = (modelId) => {
    for (const id of ['pro', 'plus', 'lite']) if (own[id] === modelId) return DEFS[id].name;
    return gemini.fallbackModel === modelId ? DEFS.lite.name : undefined;
  };
  const chains = {
    lite: [gemini.model, gemini.fallbackModel],
    plus: [gemini.modelPlus, gemini.model, gemini.fallbackModel],
    pro: [gemini.modelPro, gemini.modelPlus, gemini.model, gemini.fallbackModel],
  };
  return TIER_IDS.map((id) => {
    const ids = [...new Set(chains[id].filter(Boolean))];
    return { id, ...DEFS[id], chain: ids.map((m) => ({ id: m, label: labelFor(m) })) };
  });
}

// What the browser is allowed to see.
export const publicTier = (t) => ({ id: t.id, name: t.name, tagline: t.tagline, model: t.chain[0]?.id ?? null });

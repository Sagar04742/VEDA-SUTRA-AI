// Central place for reading environment variables.
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // 'lax' is right when the client and API share one origin (the default deployment).
  // Use 'none' only if the client is hosted on a different site than the API.
  cookieSameSite: ['lax', 'strict', 'none'].includes(process.env.COOKIE_SAMESITE) ? process.env.COOKIE_SAMESITE : 'lax',
  historyLimit: num(process.env.CHAT_HISTORY_LIMIT, 20),
  gemini: { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, fallbackModel: process.env.GEMINI_FALLBACK_MODEL || undefined, modelPlus: process.env.GEMINI_MODEL_PLUS || undefined, modelPro: process.env.GEMINI_MODEL_PRO || undefined },
  mistral: { apiKey: process.env.MISTRAL_API_KEY, model: process.env.MISTRAL_MODEL },
  // Groq (fast hosted open models). GROQ_MODELS: the Groq models Plus and Pro try (best first) after their Gemini model.
  groq: { apiKey: process.env.GROQ_API_KEY, models: (process.env.GROQ_MODELS || 'qwen/qwen3.8-27b,openai/gpt-oss-120b').split(',').map((m) => m.trim()).filter(Boolean) },
  // OpenAI. The key may be named OPENAI_API_KEY or OPEN_AI_API_KEY, and an accidental doubled "sk-sk-" prefix is repaired.
  openai: { apiKey: (process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || process.env['OPEN_AI_API_KEY '] || '').trim().replace(/^sk-(?=sk-)/, '') || undefined, models: (process.env.OPENAI_MODELS || 'gpt-4.1-mini').split(',').map((m) => m.trim()).filter(Boolean) },
  // Extra contestants for the Shastrarth arena, as "provider:model,provider:model" (the models used by the levels are always included).
  arenaModels: process.env.ARENA_MODELS,
  // Cohere writes the chat titles.
  cohere: { apiKey: process.env.COHERE_API_KEY, model: process.env.COHERE_MODEL || 'command-a-03-2025' },
  // Optional: "provider:model,provider:model" per level, e.g. TIER_PRO=gemini:gemini-3.8-flash,groq:openai/gpt-oss-120b
  tiers: { lite: process.env.TIER_LITE, plus: process.env.TIER_PLUS, pro: process.env.TIER_PRO },
};

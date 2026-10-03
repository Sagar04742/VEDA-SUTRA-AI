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
};

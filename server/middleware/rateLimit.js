import rateLimit from 'express-rate-limit';

const make = (windowMs, limit, message) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });

const fromEnv = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

// Tight limit on login/signup to slow brute force; looser for chat. Both can be tuned with env vars.
export const authLimiter = make(15 * 60 * 1000, fromEnv('AUTH_RATE_LIMIT', 30), 'Too many attempts, try again later');
export const chatLimiter = make(60 * 1000, fromEnv('CHAT_RATE_LIMIT', 60), 'Too many requests, slow down');

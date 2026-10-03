import rateLimit from 'express-rate-limit';
import { humanDuration } from '../utils/quota.js';

// On limit, answer with JSON that includes how long to wait, so the app can show a countdown.
export const makeLimiter = (windowMs, limit, what) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfterSeconds = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000));
      res.status(429).json({
        error: `${what} Please try again in ${humanDuration(retryAfterSeconds)}.`,
        code: 'rate_limit',
        retryAfterSeconds,
      });
    },
  });

const fromEnv = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

// Tight limit on login/signup to slow brute force; looser for chat. Both can be tuned with env vars.
export const authLimiter = makeLimiter(15 * 60 * 1000, fromEnv('AUTH_RATE_LIMIT', 30), 'Too many attempts.');
export const chatLimiter = makeLimiter(60 * 1000, fromEnv('CHAT_RATE_LIMIT', 60), 'You are sending requests very quickly.');

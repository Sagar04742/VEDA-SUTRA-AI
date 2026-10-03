import rateLimit from 'express-rate-limit';

const make = (windowMs, limit, message) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });

// Tight limit on login/signup to slow brute force; looser for chat.
export const authLimiter = make(15 * 60 * 1000, 30, 'Too many attempts, try again later');
export const chatLimiter = make(60 * 1000, 40, 'Too many requests, slow down');

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE = 'token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const signToken = (userId) => jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '7d' });
export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

// httpOnly cookie; a cross-site deploy (Vercel -> Render) needs SameSite=None + Secure in production.
const cookieOpts = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/',
});

export const setAuthCookie = (res, userId) =>
  res.cookie(AUTH_COOKIE, signToken(userId), { ...cookieOpts(), maxAge: MAX_AGE_MS });
export const clearAuthCookie = (res) => res.clearCookie(AUTH_COOKIE, cookieOpts());

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import User from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';
import { clearAuthCookie, setAuthCookie } from '../utils/token.js';

const router = Router();

const email = z.string().trim().toLowerCase().email('Enter a valid email');
const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });

router.post(
  '/signup',
  authLimiter,
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (await User.exists({ email })) throw new HttpError(409, 'Email is already registered');
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await User.create({ name, email, passwordHash });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'Email is already registered'); // race condition
      throw e;
    }
    setAuthCookie(res, user.id); // log in right after signup
    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    // Same message for unknown email and wrong password.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    setAuthCookie(res, user.id);
    res.json({ user });
  })
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;

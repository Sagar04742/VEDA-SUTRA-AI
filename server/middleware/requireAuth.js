import User from '../models/User.js';
import { AUTH_COOKIE, verifyToken } from '../utils/token.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';

// Protects routes: reads the JWT cookie and attaches req.user.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, 'Not authenticated');
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'Not authenticated');
  req.user = user;
  next();
});

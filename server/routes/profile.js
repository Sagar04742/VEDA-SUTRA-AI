import { Router } from 'express';
import Chat from '../models/Chat.js';
import Knowledge from '../models/Knowledge.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatLimiter, makeLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/httpError.js';
import { computeProfileStats } from '../services/profile.js';

// The signed-in user's learning analytics (their own chats only).
export function profileRoutes() {
  const router = Router();
  router.get(
    '/stats',
    requireAuth,
    chatLimiter,
    asyncHandler(async (req, res) => {
      const tz = Math.max(-840, Math.min(840, parseInt(req.query.tz, 10) || 0)); // minutes, as from getTimezoneOffset()
      const chats = await Chat.find({ userId: req.user._id })
        .select('createdAt messages.role messages.content messages.createdAt messages.solver messages.images')
        .lean();
      res.json({
        user: { name: req.user.name, email: req.user.email, memberSince: req.user.createdAt },
        stats: computeProfileStats(chats, { tzOffset: tz }),
      });
    })
  );
  return router;
}

// Public numbers for the home page: how big the knowledge library is. Cached for a minute.
let cache = { at: 0, data: null };
export function publicStatsRoutes() {
  const router = Router();
  router.get(
    '/public',
    makeLimiter(60 * 1000, 60, 'Too many requests.'),
    asyncHandler(async (_req, res) => {
      if (!cache.data || Date.now() - cache.at > 60 * 1000) {
        const [knowledgeEntries, categories] = await Promise.all([Knowledge.estimatedDocumentCount(), Knowledge.distinct('category')]);
        cache = { at: Date.now(), data: { knowledgeEntries, topicAreas: categories.length } };
      }
      res.json(cache.data);
    })
  );
  return router;
}

export const resetPublicStatsCache = () => (cache = { at: 0, data: null }); // for tests

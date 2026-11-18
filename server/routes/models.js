import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/httpError.js';
import { DEFAULT_TIER } from '../config/tiers.js';

// The answer levels shown in the model picker.
export function modelRoutes(ai) {
  const router = Router();
  router.get('/', requireAuth, (_req, res) => res.json({ tiers: ai.tiers?.() ?? [], arena: ai.arena?.() ?? [], default: DEFAULT_TIER, capabilities: ai.capabilities?.() ?? { webSearch: true } }));
  // The readiness check ("security check") before a debate: can each contestant really answer right now?
  const readySchema = z.object({ ids: z.array(z.string().trim().min(2).max(120)).min(1).max(2), fresh: z.boolean().default(false) });
  router.post(
    '/ready',
    requireAuth,
    chatLimiter,
    validate(readySchema),
    asyncHandler(async (req, res) => {
      const results = {};
      await Promise.all(req.body.ids.map(async (id) => (results[id] = ai.ready ? await ai.ready(id, { fresh: req.body.fresh }) : { ready: true, id })));
      res.json({ results });
    })
  );
  return router;
}

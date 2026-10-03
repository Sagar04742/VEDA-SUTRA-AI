import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { DEFAULT_TIER } from '../config/tiers.js';

// The answer levels shown in the model picker.
export function modelRoutes(ai) {
  const router = Router();
  router.get('/', requireAuth, (_req, res) => res.json({ tiers: ai.tiers?.() ?? [], default: DEFAULT_TIER }));
  return router;
}

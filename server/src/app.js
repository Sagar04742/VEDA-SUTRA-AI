import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '../config/env.js';
import authRoutes from '../routes/auth.js';
import { chatRoutes } from '../routes/chats.js';
import { createAi } from '../services/ai.js';
import { errorHandler, notFound } from '../middleware/errorHandler.js';

// deps.ai can be replaced in tests with a fake model service.
export function createApp(deps = {}) {
  const ai = deps.ai ?? createAi();
  const app = express();
  app.set('trust proxy', 1); // behind Render/Vercel proxies (correct IPs for rate limiting)
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, ai: ai.configError() ? 'not configured' : 'ready' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/chats', chatRoutes(ai));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

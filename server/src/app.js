import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '../config/env.js';
import authRoutes from '../routes/auth.js';
import { errorHandler, notFound } from '../middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Vercel proxies (correct IPs for rate limiting)
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

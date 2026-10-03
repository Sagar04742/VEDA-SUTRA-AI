import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '../config/env.js';
import authRoutes from '../routes/auth.js';
import { chatRoutes } from '../routes/chats.js';
import { modelRoutes } from '../routes/models.js';
import { profileRoutes, publicStatsRoutes } from '../routes/profile.js';
import { createAi } from '../services/ai.js';
import { errorHandler, notFound } from '../middleware/errorHandler.js';

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

// deps.ai can be replaced in tests with a fake model service.
export function createApp(deps = {}) {
  const ai = deps.ai ?? createAi();
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway-style proxies (correct IPs for rate limiting)
  app.use(
    helmet({
      // Don't force http->https for sub-resources; HSTS already covers real HTTPS deployments.
      contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
    })
  );
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  // Messages may carry up to 3 compressed pictures (base64); everything else stays small.
  app.use('/api/chats/:id/messages', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, ai: ai.configError() ? 'not configured' : 'ready' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/chats', chatRoutes(ai));
  app.use('/api/models', modelRoutes(ai));
  app.use('/api/profile', profileRoutes());
  app.use('/api/stats', publicStatsRoutes());
  app.use('/api', notFound);

  // Production: serve the built React app from the same origin (cookies then just work).
  if (deps.serveClient ?? (env.isProd && existsSync(CLIENT_DIST))) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

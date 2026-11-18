// Vercel serverless entry: the whole Express API runs as one function (all /api/* requests are routed here).
// The React app in client/dist is served by Vercel's CDN, so the server never serves static files here.
import { env } from '../server/config/env.js';
import { connectDB } from '../server/config/db.js';
import { createApp } from '../server/src/app.js';
import { createAi } from '../server/services/ai.js';

const ai = createAi();
const app = createApp({ ai, serveClient: false });

// Connect once per warm instance and reuse it; a failed attempt is retried on the next request.
let dbReady;
function ensureDb() {
  if (!dbReady) dbReady = connectDB(env.mongoUri).catch((e) => { dbReady = undefined; throw e; });
  return dbReady;
}

export default async function handler(req, res) {
  if (!env.jwtSecret || env.jwtSecret.length < 16) {
    return res.status(500).json({ error: 'Server is not configured: JWT_SECRET is missing or too short.' });
  }
  try {
    await ensureDb();
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    return res.status(503).json({ error: 'Database unavailable. Check MONGO_URI and the Atlas network access list.' });
  }
  return app(req, res);
}

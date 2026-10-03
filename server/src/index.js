import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { createApp } from './app.js';
import { createAi } from '../services/ai.js';

if (!env.jwtSecret || env.jwtSecret.length < 16) {
  console.error('JWT_SECRET is missing or too short. Set a long random string in server/.env');
  process.exit(1);
}
if (env.isProd && /change-me|dev-secret/i.test(env.jwtSecret)) {
  console.error('JWT_SECRET still has a placeholder value. Set a long random string before running in production.');
  process.exit(1);
}

try {
  await connectDB(env.mongoUri);
} catch (e) {
  console.error(`Could not connect to MongoDB (${e.message}). Check MONGO_URI in server/.env and that the database is running.`);
  process.exit(1);
}

const ai = createAi();
const aiProblem = ai.configError();
if (aiProblem) console.warn(`! ${aiProblem} Login works, but chat answers are disabled until it is set.`);
if (!env.mistral.apiKey || !env.mistral.model) console.warn('! Mistral is not configured (MISTRAL_API_KEY / MISTRAL_MODEL): chat titles will use the first 40 characters of the message.');

const app = createApp({ ai });
app.listen(env.port, () => console.log(`Server listening on :${env.port} (${env.nodeEnv})`));

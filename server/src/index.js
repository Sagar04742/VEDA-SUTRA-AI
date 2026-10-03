import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { createApp } from './app.js';

if (!env.jwtSecret) throw new Error('JWT_SECRET is not set');

await connectDB(env.mongoUri);
createApp().listen(env.port, () => console.log(`Server listening on :${env.port}`));

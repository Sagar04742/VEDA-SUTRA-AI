import request from 'supertest';
import mongoose from 'mongoose';
import { inject } from 'vitest';

process.env.JWT_SECRET = 'test-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CHAT_RATE_LIMIT = '100000'; // tests send many requests from one IP

// Connect to the shared test MongoDB (see globalSetup.js) using a database private to this test file.
// Returns a cleanup function.
export async function startDb() {
  const base = inject('mongoUri').replace(/\/?$/, '/');
  const dbName = `test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  await mongoose.connect(`${base}${dbName}`);
  return async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
}

// Sign up a user and return the cookie header for authenticated requests.
export async function signup(app, n = 1) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: `User ${n}`, email: `user${n}@example.com`, password: 'password123' });
  return res.headers['set-cookie'].find((c) => c.startsWith('token='));
}

// Parse the raw text of an SSE response into [{ event, data }].
export function parseSse(text) {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((b) => b && !b.startsWith(':'))
    .map((block) => {
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

// POST a message and collect the SSE stream (supertest does not buffer event-streams by default).
export function sendMessage(app, cookie, chatId, content, extra = {}) {
  return request(app)
    .post(`/api/chats/${chatId}/messages`)
    .set('Cookie', cookie)
    .send({ content, ...extra })
    .buffer(true)
    .parse((res, cb) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => cb(null, body));
    })
    .then((res) => ({ status: res.status, headers: res.headers, events: res.status === 200 ? parseSse(res.body) : [], json: res.status === 200 ? null : safeJson(res.text ?? res.body) }));
}

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

export async function newChat(app, cookie) {
  const res = await request(app).post('/api/chats').set('Cookie', cookie);
  return res.body.chat.id;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

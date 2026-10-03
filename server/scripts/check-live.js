// One-command check that your configuration really works end to end:
//   npm run check:live
// It checks the env vars, MongoDB, the knowledge base, then runs real conversations through the whole
// app (login -> chat -> Gemini streaming -> tools -> Mistral title), including the memory test
// "What is Vedic math?" followed by "What are the types of it?". It cleans up the test user afterwards.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { createApp } from '../src/app.js';
import { createAi } from '../services/ai.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Knowledge from '../models/Knowledge.js';

let failures = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!pass) failures++;
  return pass;
};
const mock = process.env.AI_MOCK === '1';
if (mock) console.log('Note: AI_MOCK=1 is set, so this checks the plumbing with the dev mock, not your real API keys.\n');

// Read an SSE response into [{event, data}].
async function readSse(res) {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((b) => ({ event: b.match(/^event: (.*)$/m)?.[1], data: b.match(/^data: (.*)$/m)?.[1] }))
    .filter((e) => e.event)
    .map((e) => ({ event: e.event, data: JSON.parse(e.data) }));
}
const answerOf = (events) => events.filter((e) => e.event === 'token').map((e) => e.data.text).join('');

async function main() {
  // 1. Environment
  ok('JWT_SECRET is set', Boolean(env.jwtSecret));
  ok('MONGO_URI is set', Boolean(env.mongoUri));
  const ai = createAi();
  ok('Gemini configured (GEMINI_API_KEY + GEMINI_MODEL)', !ai.configError(), ai.configError() ?? '');
  ok('Mistral configured (MISTRAL_API_KEY + MISTRAL_MODEL)', mock || Boolean(env.mistral.apiKey && env.mistral.model), 'titles fall back to the first 40 chars otherwise');
  if (failures) return;

  // 2. Database + knowledge base
  await connectDB(env.mongoUri);
  ok('MongoDB reachable', true);
  const count = await Knowledge.countDocuments();
  ok('knowledge base loaded', count > 0, count ? `${count} entries` : 'run `npm run ingest` first');

  // 3. Whole app, in process, on a random port
  const server = createApp({ ai }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const email = `check-${Date.now()}@example.com`;
  try {
    const signup = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Live Check', email, password: 'check-password-123' }),
    });
    ok('signup works', signup.status === 201);
    const cookie = signup.headers.get('set-cookie').split(';')[0];
    const call = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });

    const { chat } = await (await call('/chats')).json();
    const askOnce = async (content) => {
      const res = await call(`/chats/${chat.id}/messages`, { content });
      if (!res.ok) return { error: (await res.json()).error, events: [] };
      const events = await readSse(res);
      return { events, errorInfo: events.find((e) => e.event === 'error')?.data };
    };
    // Free API keys allow only a few requests per minute. If Google says "wait N seconds", do what a user would:
    // wait, then ask again once.
    const ask = async (content) => {
      let r = await askOnce(content);
      const wait = r.errorInfo?.code === 'rate_limit' ? r.errorInfo.retryAfterSeconds : null;
      if (wait && wait <= 120) {
        console.log(`      (free-tier limit reached: waiting ${wait}s, then asking again)`);
        await new Promise((res) => setTimeout(res, (wait + 2) * 1000));
        r = await askOnce(content);
      }
      return r;
    };
    const failure = (r) => r.error ?? r.errorInfo?.message;

    // Memory test
    const q1 = await ask('What is Vedic math?');
    const err1 = failure(q1);
    if (!ok('first answer streamed', !err1 && answerOf(q1.events).length > 20, err1 ?? `${answerOf(q1.events).length} chars`)) return;
    ok('answer streamed in several pieces (real streaming)', q1.events.filter((e) => e.event === 'token').length > 1);
    ok('chat title arrived live (event: title)', q1.events.some((e) => e.event === 'title'), q1.events.find((e) => e.event === 'title')?.data.title);

    const q2 = await ask('What are the types of it?');
    const a2 = answerOf(q2.events);
    ok('MEMORY: "types of it" is answered about Vedic maths', !failure(q2) && /vedic/i.test(a2) && /sutra|technique|multipl|type|kind/i.test(a2), failure(q2) ?? a2.replace(/\s+/g, ' ').slice(0, 110) + '...');

    // Solver tool
    const q3 = await ask('Multiply 98 × 97');
    const solver = q3.events.find((e) => e.event === 'solver');
    ok('SOLVER: Gemini called the solver tool', !failure(q3) && Boolean(solver), failure(q3) ?? solver?.data.tool);
    ok('SOLVER: answer is 9506 with steps', solver?.data.answer === '9506' && solver.data.steps.length > 2);

    // Honesty / scope
    const q4 = await ask('What is the capital of France?');
    ok('off-topic question is declined (no fabricated answer)', !failure(q4) && (!/Paris/.test(answerOf(q4.events)) || /vedic|ancient|scope|only/i.test(answerOf(q4.events))), failure(q4) ?? answerOf(q4.events).replace(/\s+/g, ' ').slice(0, 90));

    // Saved to DB with ownership
    const saved = await Chat.findById(chat.id);
    ok('conversation saved in MongoDB', saved.messages.length === 8, `${saved.messages.length} messages, title "${saved.title}"`);
  } finally {
    const u = await User.findOne({ email });
    if (u) {
      await Chat.deleteMany({ userId: u._id });
      await User.deleteOne({ _id: u._id });
    }
    server.close();
    await mongoose.disconnect();
  }
}

try {
  await main();
} catch (e) {
  ok('script ran without errors', false, e.message);
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);

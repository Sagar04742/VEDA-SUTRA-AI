import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { failureReason } from '../utils/quota.js';
import { createChain } from '../services/chain.js';
import { createGroqProvider } from '../services/providers/groq.js';
import { startDb, signup, sendMessage, newChat } from './helpers.js';

describe('failure reasons a person can act on', () => {
  it('explains each kind of failure in plain words', () => {
    expect(failureReason(Object.assign(new Error('x'), { status: 401 }))).toMatchObject({ kind: 'key', reason: 'its API key is rejected' });
    expect(failureReason(Object.assign(new Error('x'), { status: 404 }))).toMatchObject({ kind: 'missing' });
    expect(failureReason(Object.assign(new Error('x'), { status: 503 }))).toMatchObject({ kind: 'busy' });
    expect(failureReason(new Error('Incomplete JSON segment at the end'))).toMatchObject({ kind: 'busy' });
    expect(failureReason(new Error('weird'))).toMatchObject({ kind: 'error' });
    const limit = failureReason(Object.assign(new Error('rate limited'), { status: 429, retryAfterSeconds: 40 }));
    expect(limit).toMatchObject({ kind: 'limit', retryAfterSeconds: 40 });
    expect(limit.reason).toMatch(/free usage limit \(try again in 40 seconds\)/);
    expect(failureReason(Object.assign(new Error('limit PerDay exceeded'), { status: 429 })).reason).toMatch(/free daily limit/);
  });
});

describe('chain.ping: can this model answer right now?', () => {
  const provider = (ping) => ({ name: 'p', configured: () => true, ping, run: async () => ({}) });

  it('is ok with a timing when the model answers, and clears an old rest', async () => {
    const chain = createChain({ p: provider(async () => {}) });
    const r = await chain.ping({ provider: 'p', id: 'm' });
    expect(r.ok).toBe(true);
    expect(typeof r.ms).toBe('number');
  });

  it('says why it failed, and rests the model so chats skip it meanwhile', async () => {
    let clock = 0;
    const chain = createChain({ p: provider(async () => { throw Object.assign(new Error('rate limited'), { status: 429, retryAfterSeconds: 120 }); }) }, { now: () => clock });
    const r = await chain.ping({ provider: 'p', id: 'm' });
    expect(r).toMatchObject({ ok: false, kind: 'limit' });
    expect(chain.resting({ provider: 'p', id: 'm' })).toBe(true);
    clock += 121 * 1000;
    expect(chain.resting({ provider: 'p', id: 'm' })).toBe(false);
  });

  it('works for a real provider adapter, using one tiny request', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) };
    };
    const groq = createGroqProvider({ apiKey: 'k', fetchImpl });
    const chain = createChain({ groq });
    expect((await chain.ping({ provider: 'groq', id: 'qwen/qwen3.8-27b' })).ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].max_completion_tokens).toBeLessThanOrEqual(64);
    expect(calls[0].stream).toBeUndefined();
    const down = createChain({ groq: createGroqProvider({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401, headers: new Headers(), json: async () => ({ error: { message: 'bad key' } }) }) }) });
    expect(await down.ping({ provider: 'groq', id: 'm' })).toMatchObject({ ok: false, kind: 'key' });
  });
});

describe('the readiness endpoint and the gate in front of a debate', () => {
  let stop, app, cookie;
  const asked = [];
  const ai = {
    configError: () => null,
    tiers: () => [],
    arena: () => [
      { id: 'lite', kind: 'level', name: 'Sutra Lite', available: true },
      { id: 'pro', kind: 'level', name: 'Sutra Pro', available: true },
      { id: 'groq:busy', kind: 'model', name: 'Busy Model', available: true },
    ],
    ready: async (id) => {
      asked.push(id);
      return id === 'groq:busy' ? { ready: false, id, kind: 'limit', reason: 'it is at its free usage limit for now', tried: [] } : { ready: true, id, via: { provider: 'mistral', model: 'm', name: 'M' }, ms: 420, tried: [] };
    },
    generateTitle: async () => 'T',
    streamChat: async ({ onToken }) => (onToken('hi'), { text: 'hi', solver: [], sources: [], aborted: false }),
  };
  beforeAll(async () => {
    stop = await startDb();
    const { createApp } = await import('../src/app.js');
    app = createApp({ ai });
    cookie = await signup(app, 1);
  }, 120000);
  afterAll(() => stop());

  it('needs a login and a sensible body', async () => {
    expect((await request(app).post('/api/models/ready').send({ ids: ['lite'] })).status).toBe(401);
    expect((await request(app).post('/api/models/ready').set('Cookie', cookie).send({ ids: [] })).status).toBe(400);
    expect((await request(app).post('/api/models/ready').set('Cookie', cookie).send({ ids: ['a1', 'b2', 'c3'] })).status).toBe(400);
  });

  it('reports each contestant: ready with who answers and how fast, or not ready with the reason', async () => {
    const res = await request(app).post('/api/models/ready').set('Cookie', cookie).send({ ids: ['pro', 'groq:busy'] });
    expect(res.status).toBe(200);
    expect(res.body.results.pro).toMatchObject({ ready: true, ms: 420, via: { name: 'M' } });
    expect(res.body.results['groq:busy']).toMatchObject({ ready: false, kind: 'limit' });
  });

  it('refuses to start a debate with a contestant that is not ready (409, nothing saved, no model asked)', async () => {
    asked.length = 0;
    const id = await newChat(app, cookie);
    const res = await sendMessage(app, cookie, id, 'hello', { battle: { a: 'lite', b: 'groq:busy' } });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Busy Model is not ready: it is at its free usage limit/);
    const chat = await request(app).get(`/api/chats/${id}`).set('Cookie', cookie);
    expect(chat.body.chat.messages).toHaveLength(0);
    // and a debate between two ready contestants goes ahead
    const ok = await sendMessage(app, cookie, id, 'hello', { battle: { a: 'lite', b: 'pro' } });
    expect(ok.status).toBe(200);
  });
});

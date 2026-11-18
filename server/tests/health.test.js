import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createModelCheck } from '../services/providers/modelCheck.js';
import { createGroqProvider } from '../services/providers/groq.js';
import { createOpenAiProvider } from '../services/providers/openai.js';
import { createMistralChatProvider } from '../services/providers/mistralChat.js';
import { isSwitchable, isTransient } from '../utils/quota.js';
import { startDb, signup, sendMessage, newChat } from './helpers.js';

const listing = (ids, status = 200) => async () => ({ ok: status === 200, status, json: async () => ({ data: ids.map((id) => ({ id })) }) });

describe('model health check (free: asks the provider for its model list)', () => {
  const make = (fetchImpl) => createModelCheck({ url: 'https://x/models', headers: {}, idsOf: (b) => b.data.map((m) => m.id), fetchImpl });

  it('says ok when the key works and the model exists, and "model not found" otherwise', async () => {
    const check = make(listing(['good-model']));
    expect(await check('good-model')).toEqual({ ok: true });
    expect(await check('missing-model')).toEqual({ ok: false, status: 404, reason: 'model not found' });
  });

  it('says "key rejected" for 401 and 403', async () => {
    expect(await make(listing([], 401))('m')).toMatchObject({ ok: false, status: 401, reason: 'key rejected' });
    expect(await make(listing([], 403))('m')).toMatchObject({ ok: false, reason: 'key rejected' });
  });

  it('never holds a busy provider or a network failure against a model', async () => {
    expect(await make(listing([], 429))('m')).toMatchObject({ ok: true, unverified: true });
    expect(await make(listing([], 503))('m')).toMatchObject({ ok: true, unverified: true });
    expect(await make(async () => { throw new Error('fetch failed'); })('m')).toMatchObject({ ok: true, unverified: true });
  });

  it('asks once for many models (cached), and again after a failed network attempt', async () => {
    let calls = 0;
    const check = make(async () => { calls++; return listing(['a', 'b'])(); });
    await check('a');
    await check('b');
    expect(calls).toBe(1);
    let tries = 0;
    const flaky = make(async () => { if (++tries === 1) throw new Error('offline'); return listing(['a'])(); });
    expect((await flaky('a')).unverified).toBe(true);
    expect(await flaky('a')).toEqual({ ok: true }); // the failure was not remembered
  });

  it('is wired into every provider', async () => {
    const groq = createGroqProvider({ apiKey: 'k', fetchImpl: listing(['qwen/qwen3.8-27b']) });
    expect(await groq.check('qwen/qwen3.8-27b')).toEqual({ ok: true });
    expect((await groq.check('nope')).reason).toBe('model not found');
    const openai = createOpenAiProvider({ apiKey: 'sk-bad', fetchImpl: listing([], 401) });
    expect(await openai.check('gpt-4.1-mini')).toMatchObject({ ok: false, reason: 'key rejected' });
    const mistral = createMistralChatProvider({ apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ id: 'ministral-14b-2512', aliases: ['ministral-14b-latest'] }] }) }) });
    expect(await mistral.check('ministral-14b-latest')).toEqual({ ok: true }); // an alias counts
  });
});

describe('errors without a status are transient, so the next model gets a turn', () => {
  it('recognises broken streams, dropped connections and half-sent error bodies', () => {
    for (const message of ['Incomplete JSON segment at the end', 'fetch failed', 'read ECONNRESET', 'socket hang up', 'The operation timed out', 'terminated', 'Unexpected end of JSON input']) {
      expect(isTransient(new Error(message)), message).toBe(true);
      expect(isSwitchable(new Error(message)), message).toBe(true);
    }
  });

  it('does not treat a user stop, a real client error or an unrelated bug as transient', () => {
    expect(isTransient(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))).toBe(false);
    expect(isTransient(Object.assign(new Error('network'), { status: 400 }))).toBe(false);
    expect(isSwitchable(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false);
    expect(isSwitchable(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });
});

describe('the Shastrarth route refuses a contestant that is down', () => {
  let stop, app, cookie;
  const ai = {
    configError: () => null,
    tiers: () => [],
    arena: () => [
      { id: 'lite', kind: 'level', name: 'Sutra Lite', available: true },
      { id: 'pro', kind: 'level', name: 'Sutra Pro', available: true },
      { id: 'openai:gpt-4.1-mini', kind: 'model', name: 'GPT 4.1 Mini', available: false, note: 'key rejected' },
    ],
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

  it('answers 400 with a clear reason, before anything is saved or any model is asked', async () => {
    const id = await newChat(app, cookie);
    const res = await sendMessage(app, cookie, id, 'hello', { battle: { a: 'openai:gpt-4.1-mini', b: 'lite' } });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/GPT 4\.1 Mini is unavailable right now \(key rejected\)/);
  });
});

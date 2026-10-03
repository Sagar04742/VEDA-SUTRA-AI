import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDb, signup, sendMessage, newChat } from './helpers.js';
import { entriesForFile, loadSidecar } from '../../data/ingest.js';

// End to end through the REAL stack: routes -> DB history -> real Gemini service + tool loop ->
// real retrieval and solver. Only the SDK client is replaced by the dev mock (AI_MOCK=1), because
// no API key is available in tests. This proves the plumbing; the live-model check needs a key.
process.env.AI_MOCK = '1';

let stop, app, cookie;
const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/raw');

beforeAll(async () => {
  stop = await startDb();
  const { default: Knowledge } = await import('../models/Knowledge.js');
  const sidecar = await loadSidecar();
  await Knowledge.insertMany(await entriesForFile('core-vedic-math.json', await readFile(path.join(RAW, 'core-vedic-math.json')), sidecar));
  await Knowledge.syncIndexes();
  const { createApp } = await import('../src/app.js');
  app = createApp();
  cookie = await signup(app);
}, 120000);
afterAll(() => stop());

const textOf = (events) => events.filter((e) => e.event === 'token').map((e) => e.data.text).join('');

describe('full flow with the dev mock model', { timeout: 30000 }, () => {
  it('follow-up "types of it" is answered about Vedic maths (memory + retrieval)', async () => {
    const id = await newChat(app, cookie);
    const first = await sendMessage(app, cookie, id, 'What is Vedic math?');
    expect(textOf(first.events)).toMatch(/Vedic Mathematics/);

    const second = await sendMessage(app, cookie, id, 'What are the types of it?');
    const reply = textOf(second.events);
    expect(reply).toMatch(/Vedic Mathematics|sixteen sutras|sutras/i);
    expect(reply).toMatch(/Source:/);

  });

  it('a pronoun-only follow-up works only because of the chat history', async () => {
    const id = await newChat(app, cookie);
    await sendMessage(app, cookie, id, 'Explain Yavadunam');
    const withMemory = await sendMessage(app, cookie, id, 'Tell me more about it');
    expect(textOf(withMemory.events)).toMatch(/Yavadunam/);

    // The identical follow-up in a brand-new chat has no topic: honest "not found", no guessing.
    const fresh = await newChat(app, cookie);
    const withoutMemory = await sendMessage(app, cookie, fresh, 'Tell me more about it');
    expect(textOf(withoutMemory.events)).toMatch(/couldn't find|won't guess/i);
  });

  it('solves arithmetic through the solver tool and streams the steps', async () => {
    const id = await newChat(app, cookie);
    const res = await sendMessage(app, cookie, id, 'Multiply 98 × 97');
    const solver = res.events.find((e) => e.event === 'solver');
    expect(solver.data).toMatchObject({ tool: 'vedic_multiply', answer: '9506', method: 'nikhilam' });
    expect(textOf(res.events)).toContain('9506');

    const saved = await request(app).get(`/api/chats/${id}`).set('Cookie', cookie);
    expect(saved.body.chat.messages[1].solver[0].steps.length).toBeGreaterThan(3);
    expect(saved.body.chat.title).toBeTruthy();
    expect(saved.body.chat.title).not.toBe('New chat');
  });

  it('health endpoint reports the model as ready under the mock', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ ok: true, ai: 'ready' });
  });
});

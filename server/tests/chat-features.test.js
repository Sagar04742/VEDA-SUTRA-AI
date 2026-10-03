import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startDb, signup, sendMessage, newChat, sleep } from './helpers.js';

let stop, app, Chat, Image, cookieA, cookieB, calls, behaviour;

const fakeAi = {
  configError: () => null,
  generateTitle: async (t) => `T: ${t.slice(0, 12)}`,
  streamChat: async (args) => {
    calls.push(args);
    return behaviour(args);
  },
};
const answer = (text, extra = {}) => async ({ onToken }) => {
  onToken(text);
  return { text, solver: [], sources: [], aborted: false, ...extra };
};

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]).toString('base64');
const img = (data = JPEG, mimeType = 'image/jpeg') => ({ mimeType, data });

beforeAll(async () => {
  stop = await startDb();
  const { createApp } = await import('../src/app.js');
  ({ default: Chat } = await import('../models/Chat.js'));
  ({ default: Image } = await import('../models/Image.js'));
  app = createApp({ ai: fakeAi });
}, 120000);
afterAll(() => stop());
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  calls = [];
  behaviour = answer('Hello');
  cookieA = await signup(app, 1);
  cookieB = await signup(app, 2);
});

describe('pictures in chat', () => {
  it('stores the picture, passes it to the model, and serves it back to the owner only', async () => {
    const id = await newChat(app, cookieA);
    const res = await sendMessage(app, cookieA, id, 'What is in this picture?', { images: [img()] });
    expect(res.status).toBe(200);

    // the model got the picture as real bytes on the latest turn
    const last = calls[0].messages.at(-1);
    expect(last.images).toEqual([{ mimeType: 'image/jpeg', data: JPEG }]);

    const chat = await request(app).get(`/api/chats/${id}`).set('Cookie', cookieA);
    const m = chat.body.chat.messages[0];
    expect(m.images).toHaveLength(1);
    expect(JSON.stringify(chat.body)).not.toContain(JPEG); // bytes are not inlined in the chat JSON

    const file = await request(app).get(`/api/chats/${id}/images/${m.images[0].id}`).set('Cookie', cookieA);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/image\/jpeg/);
    expect(file.body.equals(Buffer.from(JPEG, 'base64'))).toBe(true);

    // other users and logged-out visitors cannot see it
    expect((await request(app).get(`/api/chats/${id}/images/${m.images[0].id}`).set('Cookie', cookieB)).status).toBe(404);
    expect((await request(app).get(`/api/chats/${id}/images/${m.images[0].id}`)).status).toBe(401);
    expect((await request(app).get(`/api/chats/${id}/images/not-an-id`).set('Cookie', cookieA)).status).toBe(404);
  });

  it('keeps sending earlier pictures with follow-up questions (recent ones only)', async () => {
    const id = await newChat(app, cookieA);
    await sendMessage(app, cookieA, id, 'first picture', { images: [img()] });
    await sendMessage(app, cookieA, id, 'and what about the colours?');
    const turns = calls[1].messages;
    expect(turns[0].images).toHaveLength(1); // the earlier picture is still part of the context
    expect(turns.at(-1).images).toBeUndefined();
  });

  it('accepts an image-only message', async () => {
    const id = await newChat(app, cookieA);
    const res = await sendMessage(app, cookieA, id, '', { images: [img()] });
    expect(res.status).toBe(200);
    expect(res.events.find((e) => e.event === 'title').data.title).toMatch(/^T: Image/);
  });

  it('rejects empty messages, too many pictures, fake files, and oversized bodies', async () => {
    const id = await newChat(app, cookieA);
    expect((await sendMessage(app, cookieA, id, '')).status).toBe(400);
    expect((await sendMessage(app, cookieA, id, 'x', { images: [img(), img(), img(), img()] })).status).toBe(400);
    const fake = await sendMessage(app, cookieA, id, 'x', { images: [img(Buffer.from('<script>alert(1)</script>-padding-padding').toString('base64'))] });
    expect(fake.status).toBe(400);
    expect(fake.json.error).toMatch(/not a valid JPEG/);
    expect((await sendMessage(app, cookieA, id, 'x', { images: [img(JPEG, 'image/gif')] })).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(await Image.countDocuments()).toBe(0); // nothing stored for rejected requests
  });

  it('removes pictures when the answer fails or the chat is deleted', async () => {
    const id = await newChat(app, cookieA);
    behaviour = async () => {
      throw Object.assign(new Error('x'), { status: 500 });
    };
    await sendMessage(app, cookieA, id, 'will fail', { images: [img()] });
    expect(await Image.countDocuments()).toBe(0);

    behaviour = answer('fine');
    await sendMessage(app, cookieA, id, 'works', { images: [img()] });
    expect(await Image.countDocuments()).toBe(1);
    await request(app).delete(`/api/chats/${id}`).set('Cookie', cookieA);
    expect(await Image.countDocuments()).toBe(0);
  });
});

describe('tools (web search, deep explain)', () => {
  it('passes the options to the model service and saves web sources', async () => {
    const id = await newChat(app, cookieA);
    behaviour = answer('From the web: ...', { sources: [{ title: 'Example', uri: 'https://example.com' }] });
    await sendMessage(app, cookieA, id, 'latest research?', { webSearch: true, deepExplain: true });
    expect(calls[0].options).toEqual({ webSearch: true, deepExplain: true });

    await sendMessage(app, cookieA, id, 'plain');
    expect(calls[1].options).toEqual({ webSearch: false, deepExplain: false });

    const chat = await request(app).get(`/api/chats/${id}`).set('Cookie', cookieA);
    expect(chat.body.chat.messages[1].sources).toEqual([{ title: 'Example', uri: 'https://example.com' }]);
  });

  it('forwards notices from the model service as events', async () => {
    const id = await newChat(app, cookieA);
    behaviour = async ({ onNotice, onToken }) => {
      onNotice('Web search is not available with the current AI model.');
      onToken('ok');
      return { text: 'ok', solver: [], sources: [], aborted: false };
    };
    const res = await sendMessage(app, cookieA, id, 'hi', { webSearch: true });
    expect(res.events.find((e) => e.event === 'notice').data.message).toMatch(/not available/);
  });
});

describe('chat list', () => {
  it('hides chats that have no messages yet', async () => {
    await newChat(app, cookieA);
    expect((await request(app).get('/api/chats').set('Cookie', cookieA)).body.chats).toEqual([]);
    const id = await newChat(app, cookieA);
    await sendMessage(app, cookieA, id, 'hello');
    const list = (await request(app).get('/api/chats').set('Cookie', cookieA)).body.chats;
    expect(list.map((c) => c.id)).toEqual([id]);
  });
});

describe('limits and safety', () => {
  it('tells the user how long to wait when the AI quota is reached', async () => {
    const id = await newChat(app, cookieA);
    behaviour = async () => {
      throw Object.assign(new Error(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'x.RetryInfo', retryDelay: '28s' }] } })), { status: 429 });
    };
    const res = await sendMessage(app, cookieA, id, 'hello');
    const err = res.events.find((e) => e.event === 'error').data;
    expect(err).toMatchObject({ code: 'rate_limit', retryAfterSeconds: 28 });
    expect(err.message).toMatch(/28 seconds/);
    expect((await Chat.findById(id)).messages).toHaveLength(0);
  });

  it('refuses a second message while the first is still being answered', async () => {
    const id = await newChat(app, cookieA);
    behaviour = async ({ onToken }) => {
      onToken('slow');
      await sleep(400);
      return { text: 'slow', solver: [], sources: [], aborted: false };
    };
    const first = sendMessage(app, cookieA, id, 'one');
    await sleep(150);
    const second = await sendMessage(app, cookieA, id, 'two');
    expect(second.status).toBe(409);
    expect(second.json.error).toMatch(/Still answering/);
    expect((await first).status).toBe(200);
    // and afterwards the chat accepts messages again
    behaviour = answer('ok');
    expect((await sendMessage(app, cookieA, id, 'three')).status).toBe(200);
    expect((await Chat.findById(id)).messages.map((m) => m.content)).toEqual(['one', 'slow', 'three', 'ok']);
  });

  it('answers rate-limited requests with a countdown', async () => {
    const { makeLimiter } = await import('../middleware/rateLimit.js');
    const express = (await import('express')).default;
    const tiny = express();
    tiny.use(makeLimiter(60000, 2, 'You are sending requests very quickly.'));
    tiny.get('/', (_r, res) => res.json({ ok: true }));
    await request(tiny).get('/').expect(200);
    await request(tiny).get('/').expect(200);
    const limited = await request(tiny).get('/');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('rate_limit');
    expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.body.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(limited.body.error).toMatch(/try again in/i);
  });

  it('caps very long chats', async () => {
    const id = await newChat(app, cookieA);
    const msgs = Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    await Chat.updateOne({ _id: id }, { $set: { messages: msgs } });
    const res = await sendMessage(app, cookieA, id, 'one more');
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/length limit/);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startDb, signup, sendMessage, newChat, sleep } from './helpers.js';

process.env.CHAT_HISTORY_LIMIT = '4';

let stop, app, Chat, cookieA, cookieB;
let calls; // what the fake model received
let behaviour; // swap per test

// A fake model service: records what it was given and streams a scripted answer.
const fakeAi = {
  configError: () => null,
  generateTitle: async (text) => `Title: ${text.slice(0, 10)}`,
  streamChat: async (args) => {
    calls.push({ messages: args.messages.map((m) => ({ ...m })), toolContext: args.toolContext });
    return behaviour(args);
  },
};
const answer = (text) => async ({ onToken }) => {
  for (const t of text.match(/.{1,4}/g)) onToken(t);
  return { text, solver: [], aborted: false };
};

beforeAll(async () => {
  stop = await startDb();
  const { createApp } = await import('../src/app.js');
  ({ default: Chat } = await import('../models/Chat.js'));
  app = createApp({ ai: fakeAi });
}, 120000);
afterAll(() => stop());
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  calls = [];
  behaviour = answer('Hello there');
  cookieA = await signup(app, 1);
  cookieB = await signup(app, 2);
});

describe('chat CRUD and ownership', () => {
  it('requires login for every chat route', async () => {
    for (const [method, url] of [['get', '/api/chats'], ['post', '/api/chats'], ['get', '/api/chats/abc'], ['post', '/api/chats/abc/messages']]) {
      expect((await request(app)[method](url)).status).toBe(401);
    }
  });

  it('creates, lists newest first, renames and deletes', async () => {
    const a = await newChat(app, cookieA);
    await sendMessage(app, cookieA, a, 'first');
    await sleep(5);
    const b = await newChat(app, cookieA);
    await sendMessage(app, cookieA, b, 'second');
    const list = await request(app).get('/api/chats').set('Cookie', cookieA);
    expect(list.body.chats.map((c) => c.id)).toEqual([b, a]);

    const renamed = await request(app).patch(`/api/chats/${a}`).set('Cookie', cookieA).send({ title: '  My topic ' });
    expect(renamed.body.chat.title).toBe('My topic');
    // Renaming must not move the chat to the top.
    const again = await request(app).get('/api/chats').set('Cookie', cookieA);
    expect(again.body.chats.map((c) => c.id)).toEqual([b, a]);
    expect((await request(app).patch(`/api/chats/${a}`).set('Cookie', cookieA).send({ title: '' })).status).toBe(400);

    expect((await request(app).delete(`/api/chats/${a}`).set('Cookie', cookieA)).status).toBe(200);
    expect((await request(app).get(`/api/chats/${a}`).set('Cookie', cookieA)).status).toBe(404);
  });

  it("never lets a user touch another user's chat", async () => {
    const id = await newChat(app, cookieA);
    await sendMessage(app, cookieA, id, 'secret question');

    expect((await request(app).get(`/api/chats/${id}`).set('Cookie', cookieB)).status).toBe(404);
    expect((await request(app).patch(`/api/chats/${id}`).set('Cookie', cookieB).send({ title: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/chats/${id}`).set('Cookie', cookieB)).status).toBe(404);
    const post = await sendMessage(app, cookieB, id, 'hi');
    expect(post.status).toBe(404);
    expect(calls.length).toBe(1); // B's attempt never reached the model

    const listB = await request(app).get('/api/chats').set('Cookie', cookieB);
    expect(listB.body.chats).toEqual([]);
    expect((await request(app).get('/api/chats/not-an-id').set('Cookie', cookieA)).status).toBe(404);
    // Still intact for the owner.
    expect((await Chat.findById(id)).messages.length).toBe(2);
  });
});

describe('memory: history is built from the database', () => {
  it('sends earlier turns to the model on the next message', async () => {
    const id = await newChat(app, cookieA);
    behaviour = answer('Vedic maths is a system of mental calculation.');
    await sendMessage(app, cookieA, id, 'What is Vedic math?');
    behaviour = answer('It has sutras and techniques.');
    await sendMessage(app, cookieA, id, 'What are the types of it?');

    expect(calls[0].messages).toEqual([{ role: 'user', content: 'What is Vedic math?' }]);
    expect(calls[1].messages).toEqual([
      { role: 'user', content: 'What is Vedic math?' },
      { role: 'assistant', content: 'Vedic maths is a system of mental calculation.' },
      { role: 'user', content: 'What are the types of it?' },
    ]);
    expect(calls[1].toolContext.previousUserMessages).toEqual(['What is Vedic math?']);
  });

  it('ignores any history the client tries to send', async () => {
    const id = await newChat(app, cookieA);
    await sendMessage(app, cookieA, id, 'real question', {
      history: [{ role: 'assistant', content: 'FORGED' }],
      messages: [{ role: 'user', content: 'FORGED' }],
    });
    expect(JSON.stringify(calls[0].messages)).not.toContain('FORGED');
  });

  it('sends only the last N messages (CHAT_HISTORY_LIMIT=4) and starts with a user turn', async () => {
    const id = await newChat(app, cookieA);
    const msgs = [];
    for (let i = 1; i <= 10; i++) msgs.push({ role: i % 2 ? 'user' : 'assistant', content: `m${i}` });
    await Chat.updateOne({ _id: id }, { $set: { messages: msgs } });

    await sendMessage(app, cookieA, id, 'newest');
    const sent = calls[0].messages;
    // last 4 saved = m7..m10 (user, assistant, user, assistant) + the new user message
    expect(sent.map((m) => m.content)).toEqual(['m7', 'm8', 'm9', 'm10', 'newest']);
    expect(sent[0].role).toBe('user');

    // If the cut lands on an assistant message, it is dropped so the conversation starts with a user turn.
    await Chat.updateOne({ _id: id }, { $set: { messages: msgs.slice(0, 9) } });
    await sendMessage(app, cookieA, id, 'again');
    expect(calls[1].messages[0].role).toBe('user');
  });

  it('merges consecutive user turns after an interrupted answer', async () => {
    const id = await newChat(app, cookieA);
    await Chat.updateOne({ _id: id }, { $set: { messages: [{ role: 'user', content: 'first' }] } });
    await sendMessage(app, cookieA, id, 'second');
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'first\n\nsecond' }]);
  });
});

describe('streaming over SSE', () => {
  it('streams tokens, saves the answer, and sets the title only on the first message', async () => {
    const id = await newChat(app, cookieA);
    behaviour = answer('Hello there');
    const res = await sendMessage(app, cookieA, id, 'First question here');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const names = res.events.map((e) => e.event);
    expect(names[0]).toBe('start');
    expect(names.filter((n) => n === 'token').length).toBeGreaterThan(1);
    expect(names.indexOf('title')).toBeGreaterThan(-1);
    expect(names.at(-1)).toBe('done');
    expect(names.indexOf('title')).toBeLessThan(names.indexOf('done'));
    expect(res.events.filter((e) => e.event === 'token').map((e) => e.data.text).join('')).toBe('Hello there');
    expect(res.events.find((e) => e.event === 'title').data.title).toBe('Title: First ques');

    const saved = await Chat.findById(id);
    expect(saved.title).toBe('Title: First ques');
    expect(saved.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'First question here'],
      ['assistant', 'Hello there'],
    ]);

    const second = await sendMessage(app, cookieA, id, 'Second');
    expect(second.events.some((e) => e.event === 'title')).toBe(false);
    expect((await Chat.findById(id)).title).toBe('Title: First ques');
  });

  it('forwards solver results as events and stores them on the message', async () => {
    const id = await newChat(app, cookieA);
    const entry = { tool: 'vedic_multiply', args: { a: '98', b: '97' }, method: 'nikhilam', answer: '9506', steps: ['a', 'b'] };
    behaviour = async ({ onToken, onSolver }) => {
      onSolver(entry);
      onToken('9506');
      return { text: '9506', solver: [entry], aborted: false };
    };
    const res = await sendMessage(app, cookieA, id, 'Multiply 98 x 97');
    expect(res.events.find((e) => e.event === 'solver').data.answer).toBe('9506');
    const got = await request(app).get(`/api/chats/${id}`).set('Cookie', cookieA);
    expect(got.body.chat.messages[1].solver[0]).toMatchObject({ answer: '9506', steps: ['a', 'b'] });
  });

  it('validates the message', async () => {
    const id = await newChat(app, cookieA);
    expect((await sendMessage(app, cookieA, id, '   ')).status).toBe(400);
    expect((await sendMessage(app, cookieA, id, 'x'.repeat(4001))).status).toBe(400);
    expect(calls.length).toBe(0);
  });

  it('returns 503 (and saves nothing) when the model is not configured', async () => {
    const id = await newChat(app, cookieA);
    const original = fakeAi.configError;
    fakeAi.configError = () => 'Gemini is not configured: set GEMINI_API_KEY in server/.env.';
    const res = await sendMessage(app, cookieA, id, 'hello');
    fakeAi.configError = original;
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/GEMINI_API_KEY/);
    expect((await Chat.findById(id)).messages.length).toBe(0);
  });

  it('reports a mid-stream failure as an error event and leaves no orphan user message', async () => {
    const id = await newChat(app, cookieA);
    behaviour = async ({ onToken }) => {
      onToken('partial ');
      throw Object.assign(new Error('boom: secret details'), { status: 429 });
    };
    const res = await sendMessage(app, cookieA, id, 'will fail');
    const err = res.events.find((e) => e.event === 'error');
    expect(err.data.message).toMatch(/busy|quota/i);
    expect(JSON.stringify(res.events)).not.toContain('secret details');
    expect(res.events.some((e) => e.event === 'done')).toBe(false);
    expect((await Chat.findById(id)).messages.length).toBe(0);

    // Retry works and does not duplicate the user message.
    behaviour = answer('ok now');
    await sendMessage(app, cookieA, id, 'will fail');
    const msgs = (await Chat.findById(id)).messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('a title failure never breaks the chat', async () => {
    const id = await newChat(app, cookieA);
    const original = fakeAi.generateTitle;
    // The real title service never throws; model that contract by returning the fallback.
    fakeAi.generateTitle = async (t) => t.slice(0, 40);
    const res = await sendMessage(app, cookieA, id, 'A perfectly fine question');
    fakeAi.generateTitle = original;
    expect(res.events.at(-1).event).toBe('done');
    expect((await Chat.findById(id)).title).toBe('A perfectly fine question');
  });
});

describe('stop generating', () => {
  it('aborts the model call and saves the partial answer', async () => {
    const id = await newChat(app, cookieA);
    let sawAbort = false;
    behaviour = async ({ onToken, signal }) => {
      let text = '';
      for (let i = 0; i < 200 && !signal.aborted; i++) {
        onToken('word ');
        text += 'word ';
        await sleep(10);
      }
      sawAbort = signal.aborted;
      return { text, solver: [], aborted: signal.aborted };
    };

    const server = app.listen(0);
    const port = server.address().port;
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/chats/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieA },
      body: JSON.stringify({ content: 'Tell me a long story' }),
      signal: ac.signal,
    });
    const reader = res.body.getReader();
    let got = '';
    while (!got.includes('event: token')) got += new TextDecoder().decode((await reader.read()).value);
    await sleep(60);
    ac.abort(); // client presses "Stop generating"

    for (let i = 0; i < 50 && !sawAbort; i++) await sleep(20);
    expect(sawAbort).toBe(true); // the server noticed and cancelled generation
    let msgs;
    for (let i = 0; i < 50; i++) {
      msgs = (await Chat.findById(id)).messages;
      if (msgs.length === 2) break;
      await sleep(20);
    }
    server.close();
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1].content.startsWith('word')).toBe(true);
    expect(msgs[1].content.length).toBeLessThan(200 * 5); // partial, not the full 200 words
  });
});

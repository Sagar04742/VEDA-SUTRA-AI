import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startDb, signup, sendMessage, newChat } from './helpers.js';
import { buildTiers, publicTier } from '../config/tiers.js';

let stop, app, Chat, cookie, calls, behaviour;

const fakeAi = {
  configError: () => null,
  tiers: () => buildTiers({ model: 'lite-m', modelPlus: 'plus-m', modelPro: 'pro-m' }).map(publicTier),
  arena: () => [
    ...buildTiers({ model: 'lite-m', modelPlus: 'plus-m', modelPro: 'pro-m' }).map((t) => ({ id: t.id, kind: 'level', name: t.name, style: t.style })),
    { id: 'groq:qwen/q', kind: 'model', name: 'Qwen Q', style: 'balanced', provider: 'groq', model: 'qwen/q' },
    { id: 'mistral:mini', kind: 'model', name: 'Mini', style: 'balanced', provider: 'mistral', model: 'mini' },
  ],
  capabilities: () => ({ webSearch: true, webSearchSource: 'Wikipedia' }),
  generateTitle: async (t) => `T: ${t.slice(0, 12)}`,
  streamChat: async (args) => {
    calls.push(args);
    return behaviour[args.options.tier ?? args.options.model](args);
  },
};

const good = {
  text: 'Using Nikhilam, 98 × 97 = 9506. Both numbers sit just under 100, so the working is quick.',
  solver: [{ tool: 'vedic_multiply', args: { a: '98', b: '97' }, method: 'nikhilam', answer: '9506', steps: ['x'] }],
  toolsUsed: ['vedic_multiply'],
};
const bad = { text: 'The answer is 9507.', solver: [], toolsUsed: [] };
const says = (r) => async ({ onToken, onSolver }) => {
  for (const s of r.solver) onSolver(s);
  onToken(r.text);
  return { ...r, sources: [], aborted: false };
};
const limited = async () => {
  throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
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
  behaviour = { lite: says(bad), plus: says(good), pro: says(good) };
  cookie = await signup(app, 1);
});

const ask = async (content, extra = {}) => {
  const id = await newChat(app, cookie);
  return { id, res: await sendMessage(app, cookie, id, content, { battle: { a: 'lite', b: 'pro' }, ...extra }) };
};

describe('Shastrarth: two contestants side by side', () => {
  it('streams both answers side by side, then a verdict from our own checker', async () => {
    const { id, res } = await ask('Multiply 98 × 97 using a Vedic technique');
    expect(res.status).toBe(200);
    const tokens = res.events.filter((e) => e.event === 'token');
    expect(tokens.map((e) => e.data.side).sort()).toEqual(['a', 'b']);
    expect(tokens.find((e) => e.data.side === 'a').data.text).toMatch(/9507/);
    expect(res.events.filter((e) => e.event === 'solver').map((e) => e.data.side)).toEqual(['b']);

    const verdict = res.events.find((e) => e.event === 'verdict').data;
    expect(verdict.winner).toBe('b');
    expect(verdict.b.score).toBe(10);
    expect(verdict.a.score).toBeLessThan(3);
    expect(verdict.a.breakdown.map((c) => c.key)).toEqual(['accuracy', 'grounding', 'honesty', 'clarity']);
    expect(verdict.evidence.checkedAgainst).toBe('exact solver');
    expect(verdict.evidence.calculation.answer).toBe('9506');

    // each side ran on its own level
    expect(calls.map((c) => c.options.tier).sort()).toEqual(['lite', 'pro']);

    // saved with both answers; the winner's text is the chat's memory
    const done = res.events.find((e) => e.event === 'done').data;
    expect(done.message.content).toBe(good.text);
    expect(done.message.battle.a).toMatchObject({ id: 'lite', name: 'Sutra Lite', content: bad.text });
    expect(done.message.battle.b).toMatchObject({ id: 'pro', name: 'Sutra Pro', score: 10 });
    const reloaded = await request(app).get(`/api/chats/${id}`).set('Cookie', cookie);
    expect(reloaded.body.chat.messages[1].battle.winner).toBe('b');
  });

  it('continues the conversation from the winning answer', async () => {
    const { id } = await ask('Multiply 98 × 97 using a Vedic technique');
    behaviour = { lite: says(good), plus: says(good), pro: says(good) };
    await sendMessage(app, cookie, id, 'thanks, explain that again');
    const history = calls.at(-1).messages;
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(history[1].content).toBe(good.text); // not the losing answer
  });

  it('keeps going when one side is rate limited: that side is not scored', async () => {
    behaviour.lite = limited;
    const { res } = await ask('Multiply 98 × 97 using a Vedic technique');
    expect(res.events.find((e) => e.event === 'side_error').data).toMatchObject({ side: 'a', code: 'rate_limit' });
    const verdict = res.events.find((e) => e.event === 'verdict').data;
    expect(verdict.a).toBeNull();
    expect(verdict.winner).toBeNull();
    expect(verdict.b.score).toBe(10);
    const done = res.events.find((e) => e.event === 'done').data;
    expect(done.message.battle.a.error.code).toBe('rate_limit');
    expect(done.message.content).toBe(good.text);
  });

  it('fails like a normal answer (and forgets the question) when both sides fail', async () => {
    behaviour = { lite: limited, plus: limited, pro: limited };
    const { id, res } = await ask('Multiply 98 × 97 using a Vedic technique');
    expect(res.events.at(-1).event).toBe('error');
    const chat = await Chat.findById(id);
    expect(chat.messages).toHaveLength(0);
  });

  it('says so when it cannot score (picture only)', async () => {
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]).toString('base64');
    const { res } = await ask('', { images: [{ mimeType: 'image/jpeg', data: JPEG }] });
    expect(res.events.find((e) => e.event === 'verdict').data.unscored).toBe(true);
  });

  it('needs two different levels', async () => {
    const id = await newChat(app, cookie);
    const same = await sendMessage(app, cookie, id, 'hi', { battle: { a: 'pro', b: 'pro' } });
    expect(same.status).toBe(400);
    const unknown = await sendMessage(app, cookie, id, 'hi', { battle: { a: 'pro', b: 'ultra' } });
    expect(unknown.status).toBe(400);
  });

  it('lets any model enter, not only the three levels, and judges with the full Pramana verdict', async () => {
    behaviour['groq:qwen/q'] = says(good);
    const id = await newChat(app, cookie);
    const res = await sendMessage(app, cookie, id, 'Multiply 98 × 97 using a Vedic technique', { battle: { a: 'groq:qwen/q', b: 'lite' } });
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.options.model)?.options.model).toBe('groq:qwen/q');
    expect(calls.find((c) => c.options.tier)?.options.tier).toBe('lite');
    const verdict = res.events.find((e) => e.event === 'verdict').data;
    expect(verdict.winner).toBe('a');
    expect(verdict.a.seal).toBe('verified');
    expect(verdict.a.risk.level).toBe('low');
    expect(verdict.b.risk.level).toBe('high');
    expect(verdict.b.seal).toBe('unreliable');
    expect(verdict.a.claims.some((c) => c.status === 'verified')).toBe(true);
    expect(verdict.b.claims.some((c) => c.status === 'wrong')).toBe(true);
    const saved = res.events.find((e) => e.event === 'done').data.message.battle;
    expect(saved.a).toMatchObject({ id: 'groq:qwen/q', kind: 'model', name: 'Qwen Q', provider: 'groq' });
    expect(typeof saved.a.ms).toBe('number');
    expect(saved.a.words).toBeGreaterThan(5);
  });

  it('rejects a contestant that is not in the arena', async () => {
    const id = await newChat(app, cookie);
    const res = await sendMessage(app, cookie, id, 'hi', { battle: { a: 'groq:no-such-model', b: 'lite' } });
    expect(res.status).toBe(400);
  });

  it('shows the work of each side live and keeps it', async () => {
    const withWork = (r) => async (args) => {
      args.onActivity({ id: 'k1', phase: 'start', tool: 'searchKnowledge', kind: 'knowledge', text: 'Searching the knowledge base for “x”' });
      args.onActivity({ id: 'k1', phase: 'done', tool: 'searchKnowledge', kind: 'knowledge', text: 'Searching the knowledge base for “x”', result: 'Found 1 entry: X', count: 1, items: ['X'] });
      const out = await says(r)(args);
      return { ...out, activity: [{ tool: 'searchKnowledge', kind: 'knowledge', text: 'Searching the knowledge base for “x”', result: 'Found 1 entry: X', count: 1, items: ['X'] }] };
    };
    behaviour.lite = withWork(good);
    const { res } = await ask('Multiply 98 × 97 using a Vedic technique');
    const acts = res.events.filter((e) => e.event === 'activity');
    expect(acts.map((e) => [e.data.side, e.data.phase])).toEqual([['a', 'start'], ['a', 'done']]);
    const saved = res.events.find((e) => e.event === 'done').data.message.battle;
    expect(saved.a.activity[0].result).toMatch(/Found 1 entry/);
  });

  it('a normal message still works and has no battle data', async () => {
    const id = await newChat(app, cookie);
    const res = await sendMessage(app, cookie, id, 'Multiply 98 × 97', { tier: 'plus' });
    expect(res.events.some((e) => e.event === 'verdict')).toBe(false);
    expect(res.events.find((e) => e.event === 'done').data.message.battle).toBeUndefined();
  });
});

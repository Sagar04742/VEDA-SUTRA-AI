import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGroqProvider } from '../services/providers/groq.js';
import { createOpenAiProvider } from '../services/providers/openai.js';
import { createMistralChatProvider } from '../services/providers/mistralChat.js';
import { planTools } from '../services/providers/toolLoop.js';
import { firstToolFor } from '../services/intent.js';
import { describeCall, describeResult } from '../services/activity.js';
import { createChain } from '../services/chain.js';
import { defaultSpecs, buildTiers } from '../config/tiers.js';
import { startDb } from './helpers.js';
import Knowledge from '../models/Knowledge.js';

let stopDb;
beforeAll(async () => {
  stopDb = await startDb(); // the knowledge-base search needs a database (it is empty here)
  await Knowledge.init(); // and its text index
}, 120000);
afterAll(() => stopDb());

const enc = new TextEncoder();
const sse = (events) => new ReadableStream({ start(c) { for (const e of events) c.enqueue(enc.encode(`data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)); c.close(); } });
const stop = { choices: [{ delta: {}, finish_reason: 'stop' }] };
const text = (t) => ({ choices: [{ delta: { content: t } }] });
const call = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] });

// A fake OpenAI-style server that replays scripted streams and keeps every request body.
function fake(script) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const step = script[requests.length - 1] ?? script.at(-1);
    return { ok: true, status: 200, body: sse([...step, stop]) };
  };
  return { requests, fetchImpl };
}
const newShared = () => ({ shownText: false, shownSolver: new Set() });
const ask = (content, extra = {}) => ({ messages: [{ role: 'user', content, ...extra }], options: { style: 'balanced' }, toolContext: {} });

describe('which tool must come first', () => {
  it('uses the solver for calculations and the knowledge base for questions', () => {
    expect(firstToolFor('Multiply 98 × 97')).toBe('solver');
    expect(firstToolFor('What is the Delhi Iron Pillar?')).toBe('searchKnowledge');
    expect(firstToolFor('Namaste!')).toBeNull();
    expect(firstToolFor('')).toBeNull();
  });

  it('with Web search on, the second turn must search the web (but not for a calculation or a greeting)', () => {
    expect(planTools({ content: 'What is the Delhi Iron Pillar?' }, { webSearch: true })).toEqual({ first: 'searchKnowledge', second: 'searchWeb' });
    expect(planTools({ content: 'What is the Delhi Iron Pillar?' }, {})).toEqual({ first: 'searchKnowledge', second: null });
    expect(planTools({ content: '98 × 97' }, { webSearch: true })).toEqual({ first: 'solver', second: null });
    expect(planTools({ content: 'hello' }, { webSearch: true })).toEqual({ first: null, second: null });
    // a picture with a question is left to the model (it may be about the picture), a picture with a sum is not
    expect(planTools({ content: 'what is this?', images: [{}] }, {}).first).toBeNull();
    expect(planTools({ content: '12 x 12', images: [{}] }, {}).first).toBe('solver');
  });
});

describe('forcing the first tool on Groq and OpenAI', () => {
  it('asks for searchKnowledge by name on the first turn, then lets the model choose', async () => {
    const { requests, fetchImpl } = fake([[call('c1', 'searchKnowledge', { query: 'delhi iron pillar' })], [text('It is an iron pillar.')]]);
    const out = await createGroqProvider({ apiKey: 'k', fetchImpl }).run('qwen/qwen3.8-27b', ask('What is the Delhi Iron Pillar?'), newShared());
    expect(requests[0].body.tool_choice).toEqual({ type: 'function', function: { name: 'searchKnowledge' } });
    expect(requests[1].body.tool_choice).toBe('auto');
    expect(out.toolsUsed).toEqual(['searchKnowledge']);
  });

  it('asks for any tool for a calculation, and for none at all for a greeting', async () => {
    const calc = fake([[call('c1', 'vedic_multiply', { a: '98', b: '97' })], [text('9506')]]);
    await createGroqProvider({ apiKey: 'k', fetchImpl: calc.fetchImpl }).run('m', ask('Multiply 98 × 97'), newShared());
    expect(calc.requests[0].body.tool_choice).toBe('required');
    const hi = fake([[text('Namaste!')]]);
    await createGroqProvider({ apiKey: 'k', fetchImpl: hi.fetchImpl }).run('m', ask('Namaste!'), newShared());
    expect(hi.requests[0].body.tool_choice).toBe('auto');
  });

  it('with Web search on, searches the knowledge base first and then really searches Wikipedia', async () => {
    const wiki = async () => ({ ok: true, json: async () => ({}) });
    const { requests, fetchImpl } = fake([[call('c1', 'searchKnowledge', { query: 'x' })], [call('c2', 'searchWeb', { query: 'x' })], [text('Done.')]]);
    const activity = [];
    const out = await createGroqProvider({ apiKey: 'k', fetchImpl }).run(
      'm',
      { ...ask('What is the Delhi Iron Pillar?'), options: { style: 'balanced', webSearch: true }, toolContext: { fetchImpl: wiki }, onActivity: (a) => activity.push(`${a.phase}:${a.tool}`) },
      newShared()
    );
    expect(requests[0].body.tool_choice.function.name).toBe('searchKnowledge');
    expect(requests[1].body.tool_choice).toEqual({ type: 'function', function: { name: 'searchWeb' } });
    expect(requests[2].body.tool_choice).toBe('auto');
    expect(out.toolsUsed).toEqual(['searchKnowledge', 'searchWeb']);
    expect(activity).toEqual(['start:searchKnowledge', 'done:searchKnowledge', 'start:searchWeb', 'done:searchWeb']);
    expect(out.activity.map((a) => a.kind)).toEqual(['knowledge', 'web']);
  });

  it('Mistral says "any" for a required tool', async () => {
    const seen = [];
    const client = { chat: { stream: async (req) => (seen.push(req.toolChoice), (async function* () { yield { data: { choices: [{ delta: { content: 'ok' }, finishReason: 'stop' }] } }; })()) } };
    await createMistralChatProvider({ client }).run('m', ask('Multiply 98 × 97'), newShared());
    expect(seen[0]).toBe('any');
    await createMistralChatProvider({ client }).run('m', ask('What is Nikhilam?'), newShared());
    expect(seen[1]).toEqual({ type: 'function', function: { name: 'searchKnowledge' } });
  });
});

describe('the OpenAI provider', () => {
  it('sends max_completion_tokens, and a temperature only to models that accept one', async () => {
    const a = fake([[text('hi')]]);
    await createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: a.fetchImpl }).run('gpt-4.1-mini', ask('Namaste'), newShared());
    expect(a.requests[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(a.requests[0].headers.authorization).toBe('Bearer sk-test');
    expect(a.requests[0].body.max_completion_tokens).toBe(1600);
    expect(a.requests[0].body.temperature).toBe(0.3);
    const b = fake([[text('hi')]]);
    await createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: b.fetchImpl }).run('gpt-5-mini', ask('Namaste'), newShared());
    expect(b.requests[0].body.temperature).toBeUndefined();
    expect(createOpenAiProvider({}).configured()).toBe(false);
  });

  it('a rejected key falls through to the next provider and is not asked again for an hour', async () => {
    let clock = 0;
    const calls = [];
    const rejected = async () => { calls.push('openai'); throw Object.assign(new Error('Incorrect API key'), { status: 401 }); };
    const fine = async (_id, args, shared) => { calls.push('groq'); shared.shownText = true; args.onToken?.('ok'); return { text: 'ok', solver: [], sources: [], toolsUsed: [], aborted: false }; };
    const chain = createChain({ openai: { configured: () => true, run: rejected }, groq: { configured: () => true, run: fine } }, { now: () => clock });
    const models = [{ provider: 'openai', id: 'gpt', label: 'Sutra Pro' }, { provider: 'groq', id: 'q', label: 'Sutra Pro' }];
    await chain.streamChat({ models });
    await chain.streamChat({ models });
    expect(calls).toEqual(['openai', 'groq', 'groq']);
    clock += 61 * 60 * 1000;
    await chain.streamChat({ models });
    expect(calls.slice(3)).toEqual(['openai', 'groq']);
  });

  it('joins Plus and Pro by default only when it has a key', () => {
    const base = { gemini: { modelPlus: 'gp', modelPro: 'gP' }, groq: { models: ['q'] } };
    expect(defaultSpecs({ ...base, openai: { models: ['gpt-4.1-mini'] } }).pro.map((s) => s.provider)).toEqual(['gemini', 'gemini', 'groq']);
    const withKey = buildTiers(defaultSpecs({ ...base, openai: { apiKey: 'k', models: ['gpt-4.1-mini'] } }));
    expect(withKey[2].chain.slice(0, 4).map((c) => `${c.provider}:${c.id}`)).toEqual(['gemini:gP', 'gemini:gp', 'openai:gpt-4.1-mini', 'groq:q']);
  });
});

describe('activity lines', () => {
  it('describe what is happening and what came back', () => {
    expect(describeCall('searchKnowledge', { query: 'delhi iron pillar' })).toEqual({ kind: 'knowledge', text: 'Searching the knowledge base for “delhi iron pillar”' });
    expect(describeCall('searchWeb', { query: 'iron pillar', lang: 'hi' }).text).toBe('Searching Hindi Wikipedia for “iron pillar”');
    expect(describeCall('vedic_multiply', { a: '98', b: '97' })).toEqual({ kind: 'solver', text: 'Multiplying 98 × 97 with the exact Vedic solver' });
    expect(describeResult('searchKnowledge', { results: [{ name: 'Delhi Iron Pillar' }, { name: 'Iron' }] })).toMatchObject({ count: 2, text: 'Found 2 entries: Delhi Iron Pillar, Iron' });
    expect(describeResult('searchKnowledge', { results: [] }).text).toBe('Nothing relevant in the knowledge base');
    expect(describeResult('searchWeb', { results: [{ title: 'Iron pillar of Delhi' }] })).toMatchObject({ count: 1, items: ['Iron pillar of Delhi'] });
    expect(describeResult('vedic_multiply', { method: 'nikhilam', answer: '9506' }).text).toBe('nikhilam: 9506');
    expect(describeResult('searchWeb', { error: 'offline' }).text).toMatch(/Could not finish/);
  });
});

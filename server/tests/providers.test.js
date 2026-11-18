import { describe, it, expect } from 'vitest';
import { createGroqProvider } from '../services/providers/groq.js';
import { createMistralChatProvider } from '../services/providers/mistralChat.js';
import { createChain } from '../services/chain.js';
import { parseQuotaError, durationToSeconds, isSwitchable } from '../utils/quota.js';
import { buildTiers, defaultSpecs, parseSpec, parseSpecList, publicTier } from '../config/tiers.js';
import './helpers.js';

const enc = new TextEncoder();
const sseBody = (events) => new ReadableStream({ start(c) { for (const e of events) c.enqueue(enc.encode(`data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)); c.close(); } });
const delta = (d) => ({ choices: [{ delta: d }] });
const newShared = () => ({ shownText: false, shownSolver: new Set() });

// A fake Groq: each request pops the next scripted reply (an array of SSE events, or { status, body, headers }).
function fakeGroq(script) {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const step = script[requests.length - 1] ?? script.at(-1);
    if (!Array.isArray(step)) return { ok: false, status: step.status, headers: new Headers(step.headers ?? {}), json: async () => step.body ?? {} };
    // a complete stream ends with a finish_reason; `cut: true` on the array simulates a stream that just stops
    return { ok: true, status: 200, body: sseBody(step.cut ? step : [...step, { choices: [{ delta: {}, finish_reason: 'stop' }] }]) };
  };
  return { requests, fetchImpl };
}

describe('Groq provider', () => {
  it('streams text tokens', async () => {
    const { fetchImpl, requests } = fakeGroq([[delta({ content: 'Namaste ' }), delta({ content: 'friend' }), '[DONE]']]);
    const groq = createGroqProvider({ apiKey: 'k', fetchImpl });
    const tokens = [];
    const out = await groq.run('openai/gpt-oss-20b', { messages: [{ role: 'user', content: 'hi' }], onToken: (t) => tokens.push(t) }, newShared());
    expect(tokens.join('')).toBe('Namaste friend');
    expect(out.text).toBe('Namaste friend');
    expect(requests[0].model).toBe('openai/gpt-oss-20b');
    expect(requests[0].reasoning_effort).toBe('low'); // gpt-oss only
    expect(requests[0].messages[0].role).toBe('system');
  });

  it('runs the exact solver when the model calls a tool, then answers in words', async () => {
    const call = delta({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'vedic_multiply', arguments: '{"a":"98",' } }] });
    const call2 = delta({ tool_calls: [{ index: 0, function: { arguments: '"b":"97"}' } }] });
    const { fetchImpl, requests } = fakeGroq([[call, call2], [delta({ content: 'The answer is 9506.' })]]);
    const groq = createGroqProvider({ apiKey: 'k', fetchImpl });
    const solver = [];
    const out = await groq.run('qwen/qwen3.8-27b', { messages: [{ role: 'user', content: '98 x 97' }], onSolver: (s) => solver.push(s) }, newShared());
    expect(out.solver[0].answer).toBe('9506');
    expect(solver).toHaveLength(1);
    expect(out.toolsUsed).toEqual(['vedic_multiply']);
    expect(out.text).toBe('The answer is 9506.');
    expect(requests[0].reasoning_effort).toBeUndefined();
    const toolMsg = requests[1].messages.find((m) => m.role === 'tool');
    expect(toolMsg.tool_call_id).toBe('c1');
    expect(JSON.parse(toolMsg.content).answer).toBe('9506');
  });

  it('reports a rate limit with the wait time', async () => {
    const { fetchImpl } = fakeGroq([{ status: 429, headers: { 'retry-after': '37' }, body: { error: { message: 'Rate limit reached' } } }]);
    const groq = createGroqProvider({ apiKey: 'k', fetchImpl });
    const err = await groq.run('m', { messages: [{ role: 'user', content: 'x' }] }, newShared()).catch((e) => e);
    expect(parseQuotaError(err)).toEqual({ rateLimited: true, retryAfterSeconds: 37, daily: false });
    expect(isSwitchable(err)).toBe(true);
  });

  it('treats a broken tool call as switchable', async () => {
    const { fetchImpl } = fakeGroq([{ status: 400, body: { error: { message: 'bad call', code: 'tool_use_failed' } } }]);
    const err = await createGroqProvider({ apiKey: 'k', fetchImpl }).run('m', { messages: [{ role: 'user', content: 'x' }] }, newShared()).catch((e) => e);
    expect(err.kind).toBe('tool_failed');
    expect(isSwitchable(err)).toBe(true);
  });

  it('treats a stream that stops without finishing as an error, not a short answer', async () => {
    const cut = Object.assign([delta({ content: 'Namaste, the Ved' })], { cut: true });
    const { fetchImpl } = fakeGroq([cut]);
    const err = await createGroqProvider({ apiKey: 'k', fetchImpl }).run('m', { messages: [{ role: 'user', content: 'x' }] }, newShared()).catch((e) => e);
    expect(err.status).toBe(502);
    expect(isSwitchable(err)).toBe(true);
  });

  it('is configured only with a key', () => {
    expect(createGroqProvider({}).configured()).toBe(false);
    expect(createGroqProvider({ apiKey: 'k' }).configured()).toBe(true);
  });
});

describe('Mistral chat provider', () => {
  const events = (...ds) => [...ds.map((d) => ({ data: { choices: [{ delta: d }] } })), { data: { choices: [{ delta: {}, finishReason: 'stop' }] } }];
  const fakeClient = (script) => {
    const requests = [];
    return {
      requests,
      chat: {
        stream: async (req) => {
          requests.push(req);
          const step = script[requests.length - 1] ?? script.at(-1);
          if (step instanceof Error) throw step;
          return (async function* () { for (const e of step) yield e; })();
        },
      },
    };
  };

  it('streams text and runs tools using toolCallId', async () => {
    const client = fakeClient([
      events({ toolCalls: [{ id: 'abc123', function: { name: 'vedic_square', arguments: '{"number":"95"}' } }] }),
      events({ content: 'Ninety-five squared is ' }, { content: [{ type: 'text', text: '9025.' }] }),
    ]);
    const tokens = [];
    const out = await createMistralChatProvider({ client }).run('ministral-14b-latest', { messages: [{ role: 'user', content: '95 squared' }], onToken: (t) => tokens.push(t) }, newShared());
    expect(out.solver[0].answer).toBe('9025');
    expect(out.text).toBe('Ninety-five squared is 9025.');
    const toolMsg = client.requests[1].messages.find((m) => m.role === 'tool');
    expect(toolMsg.toolCallId).toBe('abc123');
    expect(client.requests[0].model).toBe('ministral-14b-latest');
  });

  it('wraps SDK errors so the status is visible to the chain', async () => {
    const client = fakeClient([Object.assign(new Error('Rate limit'), { statusCode: 429 })]);
    const err = await createMistralChatProvider({ client }).run('m', { messages: [{ role: 'user', content: 'x' }] }, newShared()).catch((e) => e);
    expect(parseQuotaError(err).rateLimited).toBe(true);
  });

  it('sends pictures as image_url parts', async () => {
    const client = fakeClient([events({ content: 'ok' })]);
    await createMistralChatProvider({ client }).run('m', { messages: [{ role: 'user', content: 'what is this', images: [{ mimeType: 'image/png', data: 'AAA' }] }] }, newShared());
    const parts = client.requests[0].messages.at(-1).content;
    expect(parts[0]).toEqual({ type: 'image_url', imageUrl: 'data:image/png;base64,AAA' });
  });
});

describe('cross-provider chain', () => {
  const provider = (name, impl, configured = true) => ({ name, configured: () => configured, run: impl });
  const ok = (text) => async (_id, args, shared) => {
    shared.shownText = true;
    args.onToken?.(text);
    return { text, solver: [], sources: [], toolsUsed: [], aborted: false };
  };
  const limited = async () => { throw Object.assign(new Error('slow down'), { status: 429 }); };
  const models = [
    { provider: 'groq', id: 'g1', label: 'Sutra Pro' },
    { provider: 'gemini', id: 'm1', label: 'Sutra Plus' },
    { provider: 'mistral', id: 'x1', label: 'Sutra Lite' },
  ];

  it('moves to the next provider when one is rate limited, with a single notice', async () => {
    const chain = createChain({ groq: provider('groq', limited), gemini: provider('gemini', ok('from gemini')), mistral: provider('mistral', ok('from mistral')) });
    const notices = [];
    const out = await chain.streamChat({ models, onNotice: (n) => notices.push(n) });
    expect(out.text).toBe('from gemini');
    expect(out.answeredBy).toEqual({ provider: 'gemini', model: 'm1', label: 'Sutra Plus' });
    expect(notices).toEqual(['Sutra Pro is busy or at its free usage limit right now, so this answer came from Sutra Plus.']);
  });

  it('skips providers without a key', async () => {
    const chain = createChain({ groq: provider('groq', ok('nope'), false), gemini: provider('gemini', ok('gemini ok')), mistral: provider('mistral', ok('x')) });
    expect((await chain.streamChat({ models })).answeredBy.provider).toBe('gemini');
  });

  it('does not restart once text has been shown, or on non-switchable errors', async () => {
    const partial = async (_id, _a, shared) => { shared.shownText = true; throw Object.assign(new Error('x'), { status: 503 }); };
    const chain = createChain({ groq: provider('groq', partial), gemini: provider('gemini', ok('second')), mistral: provider('mistral', ok('third')) });
    await expect(chain.streamChat({ models })).rejects.toThrow('x');
    const bad = async () => { throw Object.assign(new Error('bad key'), { status: 400 }); };
    const chain2 = createChain({ groq: provider('groq', bad), gemini: provider('gemini', ok('second')), mistral: provider('mistral', ok('third')) });
    await expect(chain2.streamChat({ models })).rejects.toThrow('bad key');
  });

  it('remembers a model that reports a long wait and skips it until then', async () => {
    let clock = 1_000_000;
    const calls = [];
    const daily = async () => {
      calls.push('gemini');
      throw Object.assign(new Error('You exceeded your current quota. Please retry in 2h51m24.4s.'), { status: 429 });
    };
    const groq = async (_id, args, shared) => ((calls.push('groq'), shared.shownText = true, args.onToken?.('hi')), { text: 'hi', solver: [], sources: [], toolsUsed: [], aborted: false });
    const chain = createChain({ gemini: provider('gemini', daily), groq: provider('groq', groq), mistral: provider('mistral', ok('x')) }, { now: () => clock });
    const two = [{ provider: 'gemini', id: 'big', label: 'Sutra Pro' }, { provider: 'groq', id: 'g', label: 'Sutra Pro' }];
    await chain.streamChat({ models: two });
    expect(calls).toEqual(['gemini', 'groq']); // tried Gemini once, it said "2 hours"
    calls.length = 0;
    await chain.streamChat({ models: two });
    expect(calls).toEqual(['groq']); // not asked again
    clock += 3 * 60 * 60 * 1000;
    calls.length = 0;
    await chain.streamChat({ models: two });
    expect(calls).toEqual(['gemini', 'groq']); // quota may be back after the wait
  });

  it('throws the last error when every model is limited', async () => {
    const chain = createChain({ groq: provider('groq', limited), gemini: provider('gemini', limited), mistral: provider('mistral', limited) });
    await expect(chain.streamChat({ models })).rejects.toThrow('slow down');
  });
});

describe('level configuration', () => {
  it('parses "provider:model" lists (model ids may contain / and :)', () => {
    expect(parseSpec('groq:openai/gpt-oss-120b')).toEqual({ provider: 'groq', id: 'openai/gpt-oss-120b' });
    expect(parseSpec('nonsense')).toBeNull();
    expect(parseSpecList('gemini:a, groq:b/c ,bad')).toEqual([{ provider: 'gemini', id: 'a' }, { provider: 'groq', id: 'b/c' }]);
  });

  it('defaults: Lite is Mistral, Plus and Pro use Groq and Gemini, and levels fall back downwards', () => {
    const specs = defaultSpecs({ gemini: { model: 'g-lite', fallbackModel: 'g-fb', modelPlus: 'g-plus', modelPro: 'g-pro' }, mistral: { model: 'mi' }, groq: { models: ['q27', 'q120'] } });
    const [lite, plus, pro] = buildTiers(specs);
    expect(lite.chain.map((c) => `${c.provider}:${c.id}`)).toEqual(['mistral:mi', 'gemini:g-lite', 'gemini:g-fb']);
    expect(plus.chain.slice(0, 3).map((c) => `${c.provider}:${c.id}`)).toEqual(['gemini:g-plus', 'gemini:g-lite', 'groq:q27']);
    expect(pro.chain.map((c) => c.id)).toEqual(['g-pro', 'g-plus', 'g-lite', 'q27', 'q120', 'mi', 'g-fb']);
    expect(publicTier(pro)).toMatchObject({ provider: 'gemini', model: 'g-pro' });
  });
});

describe('quota parsing', () => {
  it('reads durations like 3m2.5s and Groq daily limits', () => {
    expect(durationToSeconds('3m2.5s')).toBe(183);
    expect(durationToSeconds('45s')).toBe(45);
    expect(durationToSeconds('1h2m')).toBe(3720);
    const e = parseQuotaError({ status: 429, message: 'Rate limit reached for model on tokens per day (TPD): try again in 12m30s' });
    expect(e).toMatchObject({ rateLimited: true, daily: true, retryAfterSeconds: 750 });
  });
});

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTiers, publicTier, TIER_IDS, DEFAULT_TIER } from '../config/tiers.js';
import { createGeminiService } from '../services/gemini.js';
import { buildSystemPrompt, SYSTEM_PROMPT } from '../services/prompt.js';
import './helpers.js'; // sets the test environment variables

const full = { model: 'lite-m', fallbackModel: 'lite-fb', modelPlus: 'plus-m', modelPro: 'pro-m' };

describe('answer levels (model picker)', () => {
  it('has three levels, Lite first and default', () => {
    expect(TIER_IDS).toEqual(['lite', 'plus', 'pro']);
    expect(DEFAULT_TIER).toBe('lite');
    expect(buildTiers(full).map((t) => t.name)).toEqual(['Sutra Lite', 'Sutra Plus', 'Sutra Pro']);
  });

  it('chains each level down to the simpler models, labelled for notices', () => {
    const [lite, plus, pro] = buildTiers(full);
    expect(lite.chain.map((c) => c.id)).toEqual(['lite-m', 'lite-fb']);
    expect(plus.chain.map((c) => c.id)).toEqual(['plus-m', 'lite-m', 'lite-fb']);
    expect(pro.chain.map((c) => c.id)).toEqual(['pro-m', 'plus-m', 'lite-m', 'lite-fb']);
    expect(pro.chain.map((c) => c.label)).toEqual(['Sutra Pro', 'Sutra Plus', 'Sutra Lite', 'Sutra Lite']);
  });

  it('a level without its own model uses the one below it', () => {
    const tiers = buildTiers({ model: 'only' });
    for (const t of tiers) expect(t.chain.map((c) => c.id)).toEqual(['only']);
    const noPlus = buildTiers({ model: 'a', modelPro: 'c' });
    expect(noPlus[2].chain.map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('shows the browser only names, descriptions and the model id', () => {
    const shown = publicTier(buildTiers(full)[2]);
    expect(Object.keys(shown).sort()).toEqual(['id', 'model', 'name', 'tagline']);
    expect(shown.model).toBe('pro-m');
  });

  it('asks for short, balanced or thorough answers without touching the core rules', () => {
    expect(buildSystemPrompt({ style: 'brief' })).toMatch(/one or two short paragraphs/);
    expect(buildSystemPrompt({ style: 'balanced' })).toMatch(/three to five short paragraphs/);
    expect(buildSystemPrompt({ style: 'thorough' })).toMatch(/thorough, well-structured answer/);
    for (const style of ['brief', 'balanced', 'thorough']) {
      const p = buildSystemPrompt({ style });
      expect(p.startsWith(SYSTEM_PROMPT)).toBe(true); // every rule is still there
      expect(p).toMatch(/keep the source line/i);
    }
    expect(buildSystemPrompt({ style: 'unknown' })).toBe(SYSTEM_PROMPT);
    expect(buildSystemPrompt({ style: 'brief', deepExplain: true, webSearch: true })).toMatch(/DEEP EXPLAIN MODE[\s\S]*WEB SEARCH MODE/);
  });
});

// ---- the chain at work, with a scripted fake client ----
function fakeClient(script) {
  const requests = [];
  return {
    requests,
    models: {
      generateContentStream: async (req) => {
        requests.push({ model: req.model, system: req.config.systemInstruction });
        const step = script[requests.length - 1] ?? script.at(-1);
        return (async function* () {
          if (step instanceof Error) throw step;
          for (const c of step) yield { candidates: [{ content: { parts: [c] } }] };
        })();
      },
    },
  };
}
const err = (status) => Object.assign(new Error(`status ${status}`), { status });
const proChain = buildTiers(full)[2].chain;
const run = (client, extra = {}) =>
  createGeminiService({ model: 'lite-m', client, retryDelayMs: 0 }).streamChat({
    messages: [{ role: 'user', content: 'hi' }],
    signal: new AbortController().signal,
    models: proChain,
    ...extra,
  });

describe('falling down the chain', () => {
  it('uses the top model when it works', async () => {
    const client = fakeClient([[{ text: 'pro answer' }]]);
    const notices = [];
    const out = await run(client, { onNotice: (n) => notices.push(n) });
    expect(out.text).toBe('pro answer');
    expect(client.requests.map((r) => r.model)).toEqual(['pro-m']);
    expect(notices).toEqual([]);
  });

  it('moves down one level when the top model is rate limited, and says so', async () => {
    const client = fakeClient([err(429), [{ text: 'plus answer' }]]);
    const notices = [];
    const out = await run(client, { onNotice: (n) => notices.push(n) });
    expect(out.text).toBe('plus answer');
    expect(client.requests.map((r) => r.model)).toEqual(['pro-m', 'plus-m']);
    expect(notices).toEqual(['Sutra Pro is busy or at its free usage limit right now, so this answer came from Sutra Plus.']);
  });

  it('keeps going down while models are limited, busy (503) or missing (404)', async () => {
    const client = fakeClient([err(429), err(503), err(503), [{ text: 'lite answer' }]]);
    const notices = [];
    const out = await run(client, { onNotice: (n) => notices.push(n) });
    expect(out.text).toBe('lite answer');
    expect(client.requests.map((r) => r.model)).toEqual(['pro-m', 'plus-m', 'plus-m', 'lite-m']); // plus got its one busy-retry first
    expect(notices.length).toBe(2); // Pro->Plus and Plus->Lite

    const gone = fakeClient([err(404), [{ text: 'from plus' }]]);
    expect((await run(gone)).text).toBe('from plus');
  });

  it('does not say anything when switching between two models of the same level', async () => {
    const client = fakeClient([err(429), [{ text: 'ok' }]]);
    const notices = [];
    await createGeminiService({ model: 'lite-m', client }).streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      models: buildTiers(full)[0].chain,
      onNotice: (n) => notices.push(n),
    });
    expect(client.requests.map((r) => r.model)).toEqual(['lite-m', 'lite-fb']);
    expect(notices).toEqual([]);
  });

  it('throws the last error if every model fails, and never switches on a bad request', async () => {
    await expect(run(fakeClient([err(429)]))).rejects.toThrow();
    const bad = fakeClient([err(400), [{ text: 'never' }]]);
    await expect(run(bad)).rejects.toThrow('status 400');
    expect(bad.requests).toHaveLength(1);
  });

  it('sends the answer-length style to the model', async () => {
    const client = fakeClient([[{ text: 'ok' }]]);
    await run(client, { options: { style: 'thorough' } });
    expect(client.requests[0].system).toMatch(/thorough mode/);
  });
});

describe('GET /api/models', () => {
  it('is for logged-in users only (the logged-in case is tested in chat-features.test.js)', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp({ ai: { configError: () => null, tiers: () => buildTiers(full).map(publicTier) } });
    expect((await request(app).get('/api/models')).status).toBe(401);
  });
});

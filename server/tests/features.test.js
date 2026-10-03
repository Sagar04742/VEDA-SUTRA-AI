import { describe, it, expect } from 'vitest';
import { createGeminiService, describeAiError } from '../services/gemini.js';
import { SYSTEM_PROMPT, buildSystemPrompt } from '../services/prompt.js';
import { parseQuotaError, humanDuration } from '../utils/quota.js';
import { decodeImages, MAX_IMAGE_BYTES } from '../utils/images.js';
import { buildConversation } from '../utils/history.js';

// ---- helpers ----
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(40, 3)]);
const b64 = (b) => b.toString('base64');

function fakeClient(script) {
  const requests = [];
  return {
    requests,
    models: {
      generateContentStream: async (req) => {
        requests.push({ model: req.model, contents: structuredClone(req.contents), config: { ...req.config, abortSignal: undefined } });
        const step = script[requests.length - 1] ?? script.at(-1);
        return (async function* () {
          if (step instanceof Error) throw step;
          for (const c of step) {
            if (c instanceof Error) throw c;
            yield c.candidates ? c : { candidates: [{ content: { parts: [c] } }] };
          }
        })();
      },
    },
  };
}
const svc = (client) => createGeminiService({ model: 'm', client });
const run = (client, extra = {}) =>
  svc(client).streamChat({ messages: [{ role: 'user', content: 'hi' }], signal: new AbortController().signal, ...extra });

describe('quota / rate-limit errors', () => {
  const apiError = (body, status = 429) => Object.assign(new Error(JSON.stringify({ error: body })), { status });

  it('reads the retry delay and per-minute vs per-day limits from Gemini errors', () => {
    const perMinute = apiError({
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34.2s' },
      ],
    });
    expect(parseQuotaError(perMinute)).toEqual({ rateLimited: true, retryAfterSeconds: 35, daily: false });

    const perDay = apiError({
      status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
    });
    expect(parseQuotaError(perDay)).toMatchObject({ rateLimited: true, daily: true });
  });

  it('falls back to text hints and ignores other errors', () => {
    expect(parseQuotaError(Object.assign(new Error('Quota exceeded. Please retry in 12.3s.'), { status: 429 })).retryAfterSeconds).toBe(13);
    expect(parseQuotaError({ status: 500, message: 'boom' }).rateLimited).toBe(false);
    expect(parseQuotaError(null).rateLimited).toBe(false);
  });

  it('turns them into friendly messages with a countdown', () => {
    const minute = describeAiError(apiError({ status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'x.RetryInfo', retryDelay: '40s' }] }));
    expect(minute).toMatchObject({ code: 'rate_limit', retryAfterSeconds: 40 });
    expect(minute.message).toMatch(/try again in 40 seconds/i);

    const daily = describeAiError(apiError({ status: 'RESOURCE_EXHAUSTED', message: 'limit PerDay exceeded' }));
    expect(daily.daily).toBe(true);
    expect(daily.message).toMatch(/daily limit/i);
    expect(daily.retryAfterSeconds).toBeNull();

    const unknown = describeAiError({ status: 429, message: 'nope' });
    expect(unknown.retryAfterSeconds).toBe(60);
    expect(describeAiError(new Error('x')).code).toBe('ai_error');
  });

  it('formats durations', () => {
    expect([humanDuration(1), humanDuration(45), humanDuration(150), humanDuration(7200)]).toEqual(['1 second', '45 seconds', 'about 3 minutes', 'about 2 hours']);
  });
});

describe('image validation', () => {
  it('accepts real JPEG, PNG and WEBP bytes (also as data URLs)', () => {
    const out = decodeImages([
      { mimeType: 'image/jpeg', data: b64(JPEG) },
      { mimeType: 'image/png', data: `data:image/png;base64,${b64(PNG)}` },
      { mimeType: 'image/webp', data: b64(WEBP) },
    ]);
    expect(out.map((o) => o.mimeType)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(out[0].buffer.equals(JPEG)).toBe(true);
  });

  it('rejects wrong signatures, non-base64, and oversized files', () => {
    expect(() => decodeImages([{ mimeType: 'image/png', data: b64(JPEG) }])).toThrow(/not a valid PNG/);
    expect(() => decodeImages([{ mimeType: 'image/jpeg', data: b64(Buffer.from('<svg onload=alert(1)></svg>')) }])).toThrow(/not a valid JPEG/);
    expect(() => decodeImages([{ mimeType: 'image/jpeg', data: 'not base64 !!!' }])).toThrow(/not valid image data/);
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_IMAGE_BYTES + 10)]);
    expect(() => decodeImages([{ mimeType: 'image/jpeg', data: b64(huge) }])).toThrow(/too large/);
  });
});

describe('history with pictures', () => {
  it('keeps image-only messages and merges image ids', () => {
    const prior = [
      { role: 'user', content: '', imageIds: ['a'] },
      { role: 'assistant', content: 'I see a sum.' },
    ];
    const turns = buildConversation(prior, 'solve it', 20, ['b']);
    expect(turns).toEqual([
      { role: 'user', content: '', imageIds: ['a'] },
      { role: 'assistant', content: 'I see a sum.' },
      { role: 'user', content: 'solve it', imageIds: ['b'] },
    ]);
    const merged = buildConversation([{ role: 'user', content: 'x', imageIds: ['a'] }], 'y', 20, ['b']);
    expect(merged).toEqual([{ role: 'user', content: 'x\n\ny', imageIds: ['a', 'b'] }]);
  });
});

describe('gemini: images, web search and deep explain', () => {
  it('sends pictures as inlineData before the text', async () => {
    const client = fakeClient([[{ text: 'ok' }]]);
    await svc(client).streamChat({
      messages: [{ role: 'user', content: 'what is this?', images: [{ mimeType: 'image/png', data: 'AAAA' }] }],
      signal: new AbortController().signal,
    });
    expect(client.requests[0].contents[0].parts).toEqual([{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { text: 'what is this?' }]);
  });

  it('supports an image-only message', async () => {
    const client = fakeClient([[{ text: 'ok' }]]);
    await svc(client).streamChat({ messages: [{ role: 'user', content: '', images: [{ mimeType: 'image/jpeg', data: 'BBBB' }] }], signal: new AbortController().signal });
    expect(client.requests[0].contents[0].parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } }]);
  });

  it('adds Google Search only when asked, and returns the web sources it used', async () => {
    const grounded = {
      candidates: [{ content: { parts: [{ text: 'From the web: ...' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a.example', title: 'A' } }, { web: { uri: 'https://a.example', title: 'A again' } }, { web: { uri: 'https://b.example' } }] } }],
    };
    const off = fakeClient([[{ text: 'plain' }]]);
    await run(off);
    expect(off.requests[0].config.tools.some((t) => t.googleSearch)).toBe(false);

    const on = fakeClient([[grounded]]);
    const out = await run(on, { options: { webSearch: true } });
    expect(on.requests[0].config.tools.some((t) => t.googleSearch)).toBe(true);
    expect(on.requests[0].config.tools.some((t) => t.functionDeclarations)).toBe(true); // KB + solver stay available
    expect(on.requests[0].config.systemInstruction).toContain('WEB SEARCH MODE');
    expect(out.sources).toEqual([{ title: 'A', uri: 'https://a.example' }, { title: 'https://b.example', uri: 'https://b.example' }]);
  });

  it('falls back (with a notice) when the model rejects Google Search + tools', async () => {
    const rejected = Object.assign(new Error('Tool use with function calling is unsupported'), { status: 400 });
    const client = fakeClient([rejected, [{ text: 'answered from the knowledge base' }]]);
    const notices = [];
    const out = await run(client, { options: { webSearch: true }, onNotice: (n) => notices.push(n) });
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1].config.tools.some((t) => t.googleSearch)).toBe(false);
    expect(notices[0]).toMatch(/Web search is not available/);
    expect(out.text).toBe('answered from the knowledge base');
  });

  it('does not hide other errors behind the web-search fallback', async () => {
    const quota = Object.assign(new Error('quota'), { status: 429 });
    await expect(run(fakeClient([quota]), { options: { webSearch: true } })).rejects.toThrow('quota');
    const bad = Object.assign(new Error('bad request'), { status: 400 });
    await expect(run(fakeClient([bad]), { options: { webSearch: false } })).rejects.toThrow('bad request');
  });

  it('deep explain extends the system prompt', async () => {
    const client = fakeClient([[{ text: 'ok' }]]);
    await run(client, { options: { deepExplain: true } });
    expect(client.requests[0].config.systemInstruction).toContain('DEEP EXPLAIN MODE');
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
  });

  it('system prompt asks for a warm tone, multilingual replies and English search queries', () => {
    for (const phrase of ['friendly and positive', 'language the user writes in', 'searchKnowledge queries in English', 'IMAGES', 'Never guess digits']) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });
});

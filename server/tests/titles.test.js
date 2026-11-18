import { describe, it, expect } from 'vitest';
import { cleanTitle, createCohereTitleService, fallbackTitle } from '../services/titles.js';

describe('title helpers', () => {
  it('cleans model output to a short, quote-free title', () => {
    expect(cleanTitle('"Multiplying Near 100 Using Nikhilam Method Today"')).toBe('Multiplying Near 100 Using Nikhilam');
    expect(cleanTitle("Title: 'Vedic Math Basics.'")).toBe('Vedic Math Basics');
    expect(cleanTitle('**Squares Ending in Five**\nextra explanation')).toBe('Squares Ending in Five');
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle(undefined)).toBe('');
  });

  it('falls back to the first 40 characters', () => {
    expect(fallbackTitle('Short one')).toBe('Short one');
    expect(fallbackTitle('x'.repeat(100))).toHaveLength(40);
    expect(fallbackTitle('   spaced    out   text  ')).toBe('spaced out text');
    expect(fallbackTitle('')).toBe('New chat');
  });
});

describe('title service (Cohere)', () => {
  const msg = 'Can you explain how Nikhilam multiplication works for 98 x 97?';
  const respond = (text, status = 200) => async () => ({ ok: status === 200, status, json: async () => ({ message: { content: [{ type: 'text', text }] } }) });

  it('uses the Cohere title and sends the key, model and message', async () => {
    let seen;
    const svc = createCohereTitleService({
      apiKey: 'ck',
      model: 'my-model',
      fetchImpl: async (url, init) => {
        seen = { url, init, body: JSON.parse(init.body) };
        return respond('"Nikhilam Multiplication Explained"')();
      },
    });
    expect(await svc.generateTitle(msg)).toBe('Nikhilam Multiplication Explained');
    expect(seen.url).toBe('https://api.cohere.com/v2/chat');
    expect(seen.init.headers.authorization).toBe('Bearer ck');
    expect(seen.body.model).toBe('my-model');
    expect(JSON.stringify(seen.body.messages)).toContain('Nikhilam');
  });

  it('falls back when Cohere errors, times out, returns junk, or is not configured', async () => {
    const expected = fallbackTitle(msg);
    const base = { apiKey: 'k', model: 'm' };
    expect(await createCohereTitleService({ ...base, fetchImpl: respond('x', 429) }).generateTitle(msg)).toBe(expected);
    expect(await createCohereTitleService({ ...base, fetchImpl: async () => { throw new Error('network'); } }).generateTitle(msg)).toBe(expected);
    expect(await createCohereTitleService({ ...base, timeoutMs: 20, fetchImpl: (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) }).generateTitle(msg)).toBe(expected);
    expect(await createCohereTitleService({ ...base, fetchImpl: respond('') }).generateTitle(msg)).toBe(expected);
    expect(await createCohereTitleService({}).generateTitle(msg)).toBe(expected); // no key or model
  });
});

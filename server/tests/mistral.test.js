import { describe, it, expect } from 'vitest';
import { cleanTitle, createTitleService, fallbackTitle } from '../services/mistral.js';

const client = (impl) => ({ chat: { complete: impl } });
const reply = (content) => client(async () => ({ choices: [{ message: { content } }] }));

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

describe('title service (Mistral)', () => {
  const msg = 'Can you explain how Nikhilam multiplication works for 98 x 97?';

  it('uses the Mistral title and sends the configured model', async () => {
    let seen;
    const svc = createTitleService({
      model: 'my-model',
      client: client(async (req) => {
        seen = req;
        return { choices: [{ message: { content: '"Nikhilam Multiplication Explained"' } }] };
      }),
    });
    expect(await svc.generateTitle(msg)).toBe('Nikhilam Multiplication Explained');
    expect(seen.model).toBe('my-model');
    expect(JSON.stringify(seen.messages)).toContain('Nikhilam');
  });

  it('handles chunked content arrays', async () => {
    const svc = createTitleService({ model: 'm', client: reply([{ type: 'text', text: 'Vedic ' }, { type: 'text', text: 'Squares' }]) });
    expect(await svc.generateTitle(msg)).toBe('Vedic Squares');
  });

  it('falls back when Mistral throws, times out, returns junk, or is not configured', async () => {
    const expected = fallbackTitle(msg);
    expect(await createTitleService({ model: 'm', client: client(async () => { throw new Error('503'); }) }).generateTitle(msg)).toBe(expected);
    expect(await createTitleService({ model: 'm', timeoutMs: 20, client: client(() => new Promise(() => {})) }).generateTitle(msg)).toBe(expected);
    expect(await createTitleService({ model: 'm', client: reply('') }).generateTitle(msg)).toBe(expected);
    expect(await createTitleService({}).generateTitle(msg)).toBe(expected); // no key or model
  });
});

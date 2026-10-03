import { describe, it, expect, beforeEach } from 'vitest';
import { searchWeb, clearWebSearchCache } from '../services/webSearch.js';
import { executeTool, webSearchDeclaration } from '../services/tools.js';
import { createGeminiService } from '../services/gemini.js';

// A fake Wikipedia: the first call lists titles, the second returns their intros.
function fakeWiki({ titles = ['Aryabhata', 'Aryabhata (satellite)'], fail } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (fail) throw new Error('network down');
    const u = new URL(url);
    if (u.searchParams.get('list') === 'search') return { ok: true, json: async () => ({ query: { search: titles.map((title) => ({ title })) } }) };
    return {
      ok: true,
      json: async () => ({ query: { pages: Object.fromEntries(titles.map((title, i) => [i, { title, extract: `${title} is a thing described in detail.` }])) } }),
    };
  };
  return { fetchImpl, calls };
}

describe('Wikipedia web search', () => {
  beforeEach(() => clearWebSearchCache());

  it('returns titles, links and short extracts', async () => {
    const { fetchImpl, calls } = fakeWiki();
    const r = await searchWeb('Aryabhata', { fetchImpl });
    expect(r.source).toBe('Wikipedia');
    expect(r.results.map((x) => x.title)).toEqual(['Aryabhata', 'Aryabhata (satellite)']);
    expect(r.results[0].url).toBe('https://en.wikipedia.org/wiki/Aryabhata');
    expect(r.results[1].url).toBe('https://en.wikipedia.org/wiki/Aryabhata_(satellite)');
    expect(r.results[0].extract).toMatch(/is a thing/);
    expect(calls).toHaveLength(2);
  });

  it('can search Hindi Wikipedia', async () => {
    const { fetchImpl, calls } = fakeWiki({ titles: ['आर्यभट'] });
    const r = await searchWeb('आर्यभट', { lang: 'hi', fetchImpl });
    expect(calls[0]).toContain('https://hi.wikipedia.org/');
    expect(r.results[0].url.startsWith('https://hi.wikipedia.org/wiki/')).toBe(true);
  });

  it('caches repeated searches and ignores empty ones', async () => {
    const { fetchImpl, calls } = fakeWiki();
    await searchWeb('Aryabhata', { fetchImpl });
    await searchWeb('  aryabhata ', { fetchImpl });
    expect(calls).toHaveLength(2); // the second search came from the cache
    expect((await searchWeb('   ', { fetchImpl })).error).toMatch(/Empty/);
  });

  it('never throws when the website is down, and "nothing found" is reported honestly', async () => {
    const down = await searchWeb('anything', { fetchImpl: fakeWiki({ fail: true }).fetchImpl });
    expect(down.results).toEqual([]);
    expect(down.error).toMatch(/could not be reached/);
    const none = await searchWeb('zzzz', { fetchImpl: fakeWiki({ titles: [] }).fetchImpl });
    expect(none.results).toEqual([]);
    const viaTool = await executeTool('searchWeb', { query: 'zzzz' }, { fetchImpl: fakeWiki({ titles: [] }).fetchImpl });
    expect(viaTool.note).toMatch(/Nothing relevant/);
  });

  it('is declared for the model with a clear description', () => {
    expect(webSearchDeclaration.name).toBe('searchWeb');
    expect(webSearchDeclaration.description).toMatch(/Wikipedia/);
    expect(webSearchDeclaration.parametersJsonSchema.required).toEqual(['query']);
  });
});

describe('Web search inside a conversation', () => {
  function client(script) {
    const requests = [];
    return {
      requests,
      models: {
        generateContentStream: async (req) => {
          requests.push({ model: req.model, contents: structuredClone(req.contents), tools: req.config.tools });
          const step = script[requests.length - 1] ?? script.at(-1);
          return (async function* () {
            if (step instanceof Error) throw step;
            for (const c of step) yield { candidates: [{ content: { parts: [c] } }] };
          })();
        },
      },
    };
  }

  it('lets the model call searchWeb, gives it the results, and returns the pages as sources', async () => {
    const quotaZero = Object.assign(new Error('{"error":{"status":"RESOURCE_EXHAUSTED"}}'), { status: 429 });
    const c = client([quotaZero, [{ functionCall: { name: 'searchWeb', args: { query: 'Aryabhata' } } }], [{ text: 'From the web (Wikipedia): Aryabhata was an astronomer.' }]]);
    const { fetchImpl } = fakeWiki();
    const out = await createGeminiService({ model: 'm', client: c, retryDelayMs: 0 }).streamChat({
      messages: [{ role: 'user', content: 'Who was Aryabhata, according to the web?' }],
      signal: new AbortController().signal,
      options: { webSearch: true },
      toolContext: { fetchImpl },
    });
    expect(out.text).toMatch(/From the web \(Wikipedia\)/);
    expect(out.sources).toEqual([
      { title: 'Aryabhata', uri: 'https://en.wikipedia.org/wiki/Aryabhata' },
      { title: 'Aryabhata (satellite)', uri: 'https://en.wikipedia.org/wiki/Aryabhata_(satellite)' },
    ]);
    // the model was shown the extracts it asked for
    const reply = c.requests.at(-1).contents.at(-1).parts[0].functionResponse.response;
    expect(reply.results[0].extract).toMatch(/is a thing/);

    // and the tool is only offered when web search is on
    const plain = client([[{ text: 'ok' }]]);
    await createGeminiService({ model: 'm', client: plain }).streamChat({ messages: [{ role: 'user', content: 'hi' }], signal: new AbortController().signal });
    expect(plain.requests[0].tools[0].functionDeclarations.some((d) => d.name === 'searchWeb')).toBe(false);
  });
});

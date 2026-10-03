// "Web search" that works on any Gemini plan: Wikipedia's public API (no key, no cost).
// Google Search grounding is used instead when the plan allows it (see gemini.js); this is the fallback.
const HOSTS = { en: 'https://en.wikipedia.org', hi: 'https://hi.wikipedia.org' };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export const clearWebSearchCache = () => cache.clear();

const clean = (q) => String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

// Returns { results: [{ title, url, extract }], source: 'Wikipedia' } or { results: [], error }.
export async function searchWeb(query, { lang = 'en', limit = 3, fetchImpl = fetch } = {}) {
  const q = clean(query);
  const host = HOSTS[lang] ?? HOSTS.en;
  if (!q) return { results: [], source: 'Wikipedia', error: 'Empty search query' };

  const key = `${host}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const get = async (params) => {
    const res = await fetchImpl(`${host}/w/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`, {
      headers: { 'user-agent': 'VedaSutra/1.0 (educational assistant)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
    return res.json();
  };

  try {
    const found = await get({ action: 'query', list: 'search', srsearch: q, srlimit: String(limit) });
    const titles = (found.query?.search ?? []).map((s) => s.title);
    if (!titles.length) return { results: [], source: 'Wikipedia' };

    const pages = await get({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '700', redirects: '1', titles: titles.join('|') });
    const byTitle = new Map(Object.values(pages.query?.pages ?? {}).map((p) => [p.title, p.extract]));
    const results = titles.map((title) => ({
      title,
      url: `${host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      extract: (byTitle.get(title) ?? '').replace(/\s+/g, ' ').trim(),
    }));
    const value = { results: results.filter((r) => r.extract), source: 'Wikipedia' };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    // Never break the chat because a website is slow or down.
    return { results: [], source: 'Wikipedia', error: 'The web search service could not be reached right now.' };
  }
}

import { env } from '../config/env.js';
import { createGeminiService } from './gemini.js';
import { createGroqProvider } from './providers/groq.js';
import { createOpenAiProvider } from './providers/openai.js';
import { createMistralChatProvider } from './providers/mistralChat.js';
import { createChain } from './chain.js';
import { createCohereTitleService } from './titles.js';
import { createMockGeminiClient, createMockCohereFetch } from './mockAi.js';
import { buildTiers, defaultSpecs, parseSpec, parseSpecList, publicTier, DEFAULT_TIER, TIER_IDS } from '../config/tiers.js';
import { PROVIDER_NAMES, prettyModelName } from '../config/models.js';

const HEALTH_EVERY_MS = 10 * 60 * 1000;

// Levels from TIER_* in .env when set, otherwise the defaults built from the per-provider variables.
function tierSpecs() {
  const fallback = defaultSpecs(env);
  return Object.fromEntries(TIER_IDS.map((id) => [id, env.tiers[id] ? parseSpecList(env.tiers[id]) : fallback[id]]));
}

const keyOf = (e) => `${e.provider}:${e.id}`;

// One object the routes use: { configError(), streamChat(), generateTitle(), tiers(), arena(), capabilities() }.
// AI_MOCK=1 swaps the providers for the dev mock; everything else is the real code path.
export function createAi({ startHealthChecks = true } = {}) {
  const mock = process.env.AI_MOCK === '1';
  const gemini = createGeminiService({
    apiKey: env.gemini.apiKey,
    model: mock ? 'mock' : env.gemini.model,
    fallbackModel: mock ? undefined : env.gemini.fallbackModel,
    client: mock ? createMockGeminiClient() : undefined,
  });
  const providers = {
    gemini: { name: 'gemini', configured: () => !gemini.configError(), check: (id) => gemini.check(id), ping: (id) => gemini.ping(id), run: (id, args, shared) => gemini.runModel(id, args, shared) },
    groq: createGroqProvider({ apiKey: env.groq.apiKey }),
    mistral: createMistralChatProvider({ apiKey: env.mistral.apiKey }),
    openai: createOpenAiProvider({ apiKey: env.openai.apiKey }),
  };
  const chain = createChain(providers);
  const titles = createCohereTitleService({
    apiKey: mock ? 'mock' : env.cohere.apiKey,
    model: mock ? 'mock' : env.cohere.model,
    fetchImpl: mock ? createMockCohereFetch() : undefined,
  });

  // Is each model really usable (key accepted, model exists)? Checked at start and every ten minutes, without spending any
  // generation quota. A model the provider refuses (rejected key, no such model) is skipped everywhere and shown as
  // unavailable, instead of failing in front of the user. Until a model has been checked it is assumed to work.
  const health = new Map(); // "provider:model" -> { ok, reason, status, at }
  const isBad = (e) => health.get(keyOf(e))?.ok === false;

  // Mock: every level answers with the mock Gemini client. Real: the configured providers, skipping any without a key.
  const all = buildTiers(mock ? { model: 'mock' } : tierSpecs());
  const chainOf = (t) => t.chain.filter((e) => chain.usable(e) && !isBad(e));
  const liveTiers = () => all.map((t) => ({ ...t, chain: chainOf(t) })).filter((t) => t.chain.length);

  // Everyone who can enter the Shastrarth arena: the three levels, then every single model the levels use (plus ARENA_MODELS).
  const arenaModels = (() => {
    const seen = new Map();
    for (const t of all) for (const e of t.chain) if (chain.usable(e)) seen.set(keyOf(e), { provider: e.provider, id: e.id });
    for (const spec of parseSpecList(env.arenaModels)) if (chain.usable(spec)) seen.set(keyOf(spec), spec);
    return [...seen.values()];
  })();
  if (mock) arenaModels.push({ provider: 'gemini', id: 'mock-sloppy' }); // dev only: a careless contestant, to see the verdicts differ

  async function refreshHealth() {
    await Promise.all(
      arenaModels.map(async (e) => {
        const before = health.get(keyOf(e))?.ok;
        const result = await chain.check(e).catch(() => ({ ok: true, unverified: true }));
        health.set(keyOf(e), { ...result, at: Date.now() });
        if (result.ok === false && before !== false) console.warn(`! ${PROVIDER_NAMES[e.provider] ?? e.provider} ${e.id} is unavailable (${result.reason}); it is skipped until the next check.`);
        if (result.ok && before === false) console.warn(`${PROVIDER_NAMES[e.provider] ?? e.provider} ${e.id} is available again.`);
      })
    );
  }
  if (!mock && startHealthChecks) {
    refreshHealth().catch(() => {});
    setInterval(() => refreshHealth().catch(() => {}), HEALTH_EVERY_MS).unref();
  }

  // The readiness check: before a model is used, ask it a tiny real question to see that it can answer properly right now.
  // A level is ready if ANY model in its chain is (and says which one will answer). Results are remembered briefly:
  // a good answer for three minutes, a failure for under a minute, so asking again is instant and free.
  const probes = new Map(); // "provider:model" -> { at, result }
  const PROBE_OK_MS = 3 * 60 * 1000;
  const PROBE_FAIL_MS = 40 * 1000;
  async function probe(e, fresh = false) {
    const key = keyOf(e);
    const hit = probes.get(key);
    if (!fresh && hit && Date.now() - hit.at < (hit.result.ok ? PROBE_OK_MS : PROBE_FAIL_MS)) return hit.result;
    const h = health.get(key);
    let result;
    if (h?.ok === false) result = { ok: false, kind: h.status === 404 ? 'missing' : 'key', reason: h.reason };
    else if (chain.resting(e)) result = { ok: false, kind: 'limit', reason: 'it is at its free usage limit for now' };
    else result = await chain.ping(e);
    probes.set(key, { at: Date.now(), result });
    return result;
  }
  async function ready(id, { fresh = false } = {}) {
    const tier = all.find((t) => t.id === id);
    const entries = tier ? chainOf(tier) : (() => { const spec = parseSpec(id); return spec && chain.usable(spec) ? [spec] : []; })();
    if (!entries.length) return { ready: false, id, kind: 'missing', reason: 'it is not configured', tried: [] };
    const tried = [];
    for (const e of entries) {
      const r = await probe(e, fresh);
      tried.push({ provider: e.provider, model: e.id, name: prettyModelName(e.id), ok: r.ok, reason: r.reason, kind: r.kind });
      if (r.ok) return { ready: true, id, via: { provider: e.provider, model: e.id, name: prettyModelName(e.id) }, ms: r.ms, fallback: e !== entries[0], tried };
    }
    const first = tried[0];
    return { ready: false, id, kind: first.kind, reason: first.reason, tried };
  }

  const arena = () => [
    ...liveTiers().map((t) => ({ id: t.id, kind: 'level', name: t.name, tagline: t.tagline, style: t.style, provider: t.chain[0].provider, model: t.chain[0].id, available: true })),
    ...arenaModels.map((m) => {
      const h = health.get(keyOf(m));
      return {
        id: keyOf(m),
        kind: 'model',
        name: prettyModelName(m.id),
        tagline: `${PROVIDER_NAMES[m.provider] ?? m.provider} · ${m.id}`,
        style: 'balanced',
        provider: m.provider,
        model: m.id,
        available: h?.ok !== false,
        ...(h?.ok === false ? { note: h.reason } : chain.resting(m) ? { busy: true, note: 'at its free usage limit for now' } : {}),
      };
    }),
  ];

  // What the health check found, for scripts and the start-up log.
  const report = () =>
    arenaModels.map((m) => {
      const h = health.get(keyOf(m));
      return { provider: m.provider, model: m.id, name: prettyModelName(m.id), ok: h ? h.ok : null, reason: h?.reason, unverified: Boolean(h?.unverified), busy: chain.resting(m), levels: all.filter((t) => t.chain.some((e) => keyOf(e) === keyOf(m))).map((t) => t.name) };
    });

  return {
    configError: () => (liveTiers().length ? null : 'No AI provider is configured: set GEMINI_API_KEY, MISTRAL_API_KEY or GROQ_API_KEY (and the model names) in server/.env.'),
    tiers: () => liveTiers().map(publicTier),
    arena,
    ready,
    refreshHealth,
    report,
    capabilities: () => (mock ? { webSearch: true, webSearchSource: 'Google Search' } : { webSearch: true, webSearchSource: gemini.capabilities().webSearchSource }),
    probeWebSearch: () => (mock || gemini.configError() ? undefined : gemini.probeWebSearch()),
    // options.tier picks the level in the model picker (which models to try, and how long the answer should be);
    // options.model ("provider:model") asks one specific model, with no fallback (used by the Shastrarth arena).
    streamChat: ({ options = {}, ...args }) => {
      if (options.model) {
        const spec = parseSpec(options.model);
        const entry = spec && { ...spec, label: prettyModelName(spec.id) };
        if (!entry || !chain.usable(entry)) throw Object.assign(new Error(`The model ${options.model} is not available.`), { status: 404 });
        const h = health.get(keyOf(entry));
        if (h?.ok === false) throw Object.assign(new Error(`${entry.label} is unavailable: ${h.reason}.`), { status: h.status ?? 404 });
        return chain.streamChat({ ...args, models: [entry], options: { ...options, style: 'balanced' } });
      }
      const tiers = liveTiers();
      const tier = tiers.find((t) => t.id === (options.tier ?? DEFAULT_TIER)) ?? tiers[0];
      return chain.streamChat({ ...args, models: tier.chain, options: { ...options, style: tier.style } });
    },
    generateTitle: (text) => titles.generateTitle(text),
  };
}

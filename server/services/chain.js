import { failureReason, isSwitchable, parseQuotaError } from '../utils/quota.js';

const MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MIN_COOLDOWN_S = 20; // shorter waits are not worth remembering

// Runs one answer down a chain of models that may live on different providers (Gemini, Groq, Mistral).
// providers = { gemini, groq, mistral }, each { name, configured(), run(modelId, args, shared) }.
// If a model is rate limited / busy / missing before anything was shown, the whole answer restarts on the next one.
//
// Circuit breaker: when a model says "try again in 2 hours" (a daily free-tier limit), it is skipped until then
// instead of wasting a call, and a delay, on every question.
export function createChain(providers, { now = Date.now } = {}) {
  const usable = (entry) => Boolean(providers[entry.provider]?.configured());
  const cooldown = new Map(); // "provider:model" -> time it may be tried again
  const keyOf = (e) => `${e.provider}:${e.id}`;
  const resting = (e) => (cooldown.get(keyOf(e)) ?? 0) > now();

  function rest(entry, err) {
    // A rejected key will not fix itself in a minute: stop asking for an hour.
    if ([401, 403].includes(err?.status ?? err?.statusCode)) {
      cooldown.set(keyOf(entry), now() + 60 * 60 * 1000);
      return;
    }
    const quota = parseQuotaError(err);
    if (!quota.rateLimited || !quota.retryAfterSeconds || quota.retryAfterSeconds < MIN_COOLDOWN_S) return;
    cooldown.set(keyOf(entry), now() + Math.min(quota.retryAfterSeconds * 1000, MAX_COOLDOWN_MS));
  }

  return {
    usable,
    resting,
    // Can this model answer RIGHT NOW? One tiny real request. A failure also rests the model (so chats skip it meanwhile).
    // Returns { ok: true, ms } or { ok: false, kind, reason, retryAfterSeconds, ms }.
    async ping(entry) {
      const provider = providers[entry.provider];
      if (!provider?.ping) return { ok: true, ms: 0, unverified: true };
      const t0 = Date.now();
      try {
        await provider.ping(entry.id);
        cooldown.delete(keyOf(entry));
        return { ok: true, ms: Date.now() - t0 };
      } catch (err) {
        rest(entry, err);
        return { ok: false, ms: Date.now() - t0, ...failureReason(err) };
      }
    },
    // { ok, reason } for one model, or { ok: true } when its provider cannot be asked
    check: async (entry) => (providers[entry.provider]?.check ? providers[entry.provider].check(entry.id) : { ok: true }),

    // args.models = [{ provider, id, label }]. Returns { text, solver, sources, toolsUsed, aborted, answeredBy }.
    async streamChat(args) {
      const configured = (args.models ?? []).filter(usable);
      if (!configured.length) throw Object.assign(new Error('No AI model is available for this level.'), { status: 404 });
      // Models that are resting are skipped, unless every one of them is (then try them all: the limit may have lifted).
      const ready = configured.filter((e) => !resting(e));
      const chain = ready.length ? ready : configured;
      const requested = configured[0]; // what the user picked, whatever is resting
      const shared = { shownText: false, shownSolver: new Set() };
      let lastError;
      for (let i = 0; i < chain.length; i++) {
        const entry = chain[i];
        try {
          const result = await providers[entry.provider].run(entry.id, args, shared);
          // One notice, naming the level the user chose and the one that really answered (not every hop in between).
          if (requested.label && entry.label && requested.label !== entry.label) {
            args.onNotice?.(`${requested.label} is busy or at its free usage limit right now, so this answer came from ${entry.label}.`);
          }
          return { ...result, answeredBy: { provider: entry.provider, model: entry.id, label: entry.label } };
        } catch (err) {
          lastError = err;
          if (!args.signal?.aborted) rest(entry, err);
          const next = chain[i + 1];
          if (!next || !isSwitchable(err) || shared.shownText || args.signal?.aborted) throw err;
          console.warn(`Model ${entry.provider}:${entry.id} unavailable (${err?.status ?? err?.statusCode ?? err?.kind ?? 'error'}); answering with ${next.provider}:${next.id} instead.`);
        }
      }
      throw lastError;
    },
  };
}

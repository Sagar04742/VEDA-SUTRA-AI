// "Is this model really usable?" without spending any generation quota: ask the provider for its list of models with the
// key. The answer is one of
//   { ok: true }                                        the key works and the model exists
//   { ok: false, status: 401, reason: 'key rejected' }  the provider refuses the key
//   { ok: false, status: 404, reason: 'model not found' }
// A network problem is NOT held against a model ({ ok: true, unverified: true }), so being offline never hides everything.
export function createModelCheck({ url, headers, idsOf, fetchImpl = fetch, ttlMs = 5 * 60 * 1000, timeoutMs = 10000 }) {
  let cache = { at: 0, value: null };

  async function list() {
    if (cache.value && Date.now() - cache.at < ttlMs) return cache.value;
    let value;
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) value = { ids: new Set(idsOf(await res.json())) };
      else value = { status: res.status };
    } catch {
      return { unreachable: true }; // not cached: try again next time
    }
    cache = { at: Date.now(), value };
    return value;
  }

  return async function check(model) {
    const found = await list();
    if (found.unreachable) return { ok: true, unverified: true };
    if (found.status) {
      // 429 means the key works and is just busy
      if (found.status === 429 || found.status >= 500) return { ok: true, unverified: true };
      return { ok: false, status: found.status, reason: found.status === 401 || found.status === 403 ? 'key rejected' : `the provider answered HTTP ${found.status}` };
    }
    return found.ids.has(model) ? { ok: true } : { ok: false, status: 404, reason: 'model not found' };
  };
}

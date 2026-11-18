import { useCallback, useEffect, useRef, useState } from 'react';
import { modelsApi } from '../api/models.js';

// The readiness check ("security check") for the two contestants: before a debate starts, each one is asked a tiny real
// question to see that it can answer properly right now. Runs whenever a contestant changes, and again on demand.
//   of(id) -> { state: 'checking' | 'ready' | 'blocked' | 'unknown', result? }
export function useReadiness(a, b, enabled = true) {
  const [map, setMap] = useState({}); // id -> { state, result }
  const run = useRef(0);

  const check = useCallback(
    async (fresh = false) => {
      const ids = [a, b];
      const my = ++run.current;
      setMap((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, { state: 'checking' }])) }));
      try {
        const results = await modelsApi.ready(ids, fresh);
        if (my !== run.current) return null; // a newer check has started
        const next = Object.fromEntries(ids.map((id) => [id, results[id]?.ready ? { state: 'ready', result: results[id] } : { state: 'blocked', result: results[id] ?? { reason: 'no answer from the check' } }]));
        setMap((m) => ({ ...m, ...next }));
        return next;
      } catch {
        if (my !== run.current) return null;
        // The check itself could not run (offline?): do not block the user, say it is unverified.
        const next = Object.fromEntries(ids.map((id) => [id, { state: 'unknown' }]));
        setMap((m) => ({ ...m, ...next }));
        return next;
      }
    },
    [a, b]
  );

  useEffect(() => {
    if (!enabled || !a || !b || a === b) return undefined;
    const t = setTimeout(() => check(false), 350); // wait for the person to finish choosing
    return () => clearTimeout(t);
  }, [a, b, enabled, check]);

  const of = (id) => map[id] ?? { state: 'checking' };
  const both = [a, b].every((id) => ['ready', 'unknown'].includes(of(id).state));
  const checking = [a, b].some((id) => of(id).state === 'checking');

  return { of, both, checking, recheck: () => check(true), verify: () => check(false) };
}

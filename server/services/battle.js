import { buildGroundTruth, decideWinner, scoreAnswer } from './verifier.js';
import { describeAiError } from './gemini.js';
import { tierStyle } from '../config/tiers.js';

// Shastrarth (शास्त्रार्थ), the battle: one question, two contestants, answered side by side. A contestant is one of the
// three levels (Sutra Lite, Plus, Pro) or one specific model from any provider.
//
// Both answers are then judged by Pramana, the project's own deterministic checker (no AI judge): the exact Vedic
// solver and the sourced knowledge base are the ground truth, and both answers are judged against the same evidence.
//
// send(event, data) streams to the browser; token / solver / notice / activity events carry side: 'a' | 'b'.
// Returns { record, text, solver, sources, aborted }. record is what gets saved on the chat message.
// Throws the model's error if BOTH sides failed (so the route can handle it like a normal failed answer).
export async function runBattle({ ai, contestants, content, messages, previousUserMessages, options, signal, send, buildTruth = buildGroundTruth }) {
  const arena = ai.arena?.() ?? (ai.tiers?.() ?? []).map((t) => ({ id: t.id, kind: 'level', name: t.name, style: tierStyle(t.id), provider: t.provider, model: t.model }));
  const infoOf = (id) => arena.find((c) => c.id === id) ?? { id, kind: TIER_LIKE.test(id) ? 'level' : 'model', name: id, style: tierStyle(id) ?? 'balanced' };
  const sides = { a: infoOf(contestants[0]), b: infoOf(contestants[1]) };
  const truthTask = content.trim() ? buildTruth(content, { context: previousUserMessages }).catch(() => null) : Promise.resolve(null);

  async function runSide(side) {
    const who = sides[side];
    const base = { id: who.id, kind: who.kind, name: who.name, provider: who.provider, model: who.model };
    const t0 = Date.now();
    try {
      const r = await ai.streamChat({
        messages,
        signal,
        options: { ...options, ...(who.kind === 'level' ? { tier: who.id } : { model: who.id }) },
        toolContext: { previousUserMessages },
        onToken: (text) => send('token', { side, text }),
        onSolver: (s) => send('solver', { side, ...s }),
        onNotice: (message) => send('notice', { side, message }),
        onActivity: (a) => send('activity', { side, ...a }),
      });
      const ms = Date.now() - t0;
      send('side_done', { side, aborted: Boolean(r.aborted), ms });
      return { ...base, ...r, ms, rawError: null };
    } catch (err) {
      const ms = Date.now() - t0;
      if (signal?.aborted) return { ...base, text: '', solver: [], sources: [], aborted: true, ms, rawError: null };
      console.error(`Battle: ${side} (${who.id}) failed:`, err?.message ?? err);
      const error = describeAiError(err);
      send('side_error', { side, ...error, ms });
      return { ...base, text: '', solver: [], sources: [], aborted: false, ms, error, rawError: err };
    }
  }

  const [a, b] = await Promise.all([runSide('a'), runSide('b')]);
  const aborted = Boolean(a.aborted || b.aborted);
  if (!aborted && a.rawError && b.rawError) throw a.rawError;

  // Pramana judges once both are finished, each answer against the same ground truth.
  let verdict = null;
  const canScore = !aborted && Boolean(content.trim());
  if (canScore) {
    const truth = await truthTask;
    if (truth) {
      const judgedAt = performance.now();
      // Each answer is also held to the length its own level promised (Lite short, Plus medium, Pro long).
      const styleOf = (who) => (options.deepExplain ? 'thorough' : who.style);
      const sa = a.error ? null : scoreAnswer(truth, a, { style: styleOf(sides.a) });
      const sb = b.error ? null : scoreAnswer(truth, b, { style: styleOf(sides.b) });
      verdict = { a: sa, b: sb, winner: decideWinner(sa?.score, sb?.score), margin: sa && sb ? Math.round(Math.abs(sa.score - sb.score) * 10) / 10 : null, evidence: (sa ?? sb).evidence, judgedMs: Math.max(1, Math.round(performance.now() - judgedAt)) };
    }
  }
  if (!aborted) {
    send('verdict', verdict ?? { unscored: true, reason: content.trim() ? 'This answer could not be checked.' : 'Scoring needs a written question (pictures alone cannot be checked).' });
  }

  const words = (t) => (String(t).match(/\S+/g) ?? []).length;
  const side = (r, v) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    ...(r.provider ? { provider: r.provider, model: r.model } : {}),
    content: r.text,
    solver: r.solver,
    ...(r.sources?.length ? { sources: r.sources } : {}),
    ...(r.activity?.length ? { activity: r.activity } : {}),
    ...(r.answeredBy ? { answeredBy: r.answeredBy } : {}),
    ...(r.error ? { error: r.error } : {}),
    ms: r.ms,
    words: words(r.text),
    ...(v ? { score: v.score, breakdown: v.breakdown, claims: v.claims, stats: v.stats, risk: v.risk, seal: v.seal } : {}),
  });
  const record = {
    a: side(a, verdict?.a),
    b: side(b, verdict?.b),
    ...(verdict ? { winner: verdict.winner, margin: verdict.margin, evidence: verdict.evidence, judgedMs: verdict.judgedMs } : {}),
  };

  // The side whose answer carries on as the chat's memory: the winner (side a on a tie), unless it has nothing to keep.
  const prefer = verdict?.winner === 'b' ? b : a;
  const other = prefer === a ? b : a;
  const kept = prefer.text.trim() || prefer.solver.length ? prefer : other;
  return { record, text: kept.text, solver: kept.solver, sources: kept.sources ?? [], activity: kept.activity ?? [], aborted };
}

const TIER_LIKE = /^(lite|plus|pro)$/;

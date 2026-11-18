import { prettyModelName, PROVIDER_NAMES } from '../config/models.js';

// The Shastrarth leaderboard: an Elo rating for every model, built from the user's own battles.
// Every battle result comes from Pramana (the deterministic checker), so ratings reflect verified quality, not opinion.

const START = 1000;
const K = 24;

// Who really answered (a level can fall back to another model), as a stable key and a display name.
function identity(side) {
  const by = side.answeredBy;
  const provider = by?.provider ?? side.provider;
  const model = by?.model ?? side.model;
  if (provider && model) return { key: `${provider}:${model}`, name: prettyModelName(model), provider, model };
  return { key: side.id ?? side.name, name: side.name ?? side.id, provider: null, model: null };
}

// chats: [{ messages: [{ createdAt, battle? , compare? }] }]
export function computeLeaderboard(chats) {
  const battles = [];
  for (const chat of chats) {
    for (const m of chat.messages ?? []) {
      const b = m.battle ?? m.compare;
      if (!b?.a || !b?.b) continue;
      if (b.a.score == null || b.b.score == null) continue; // a side with no answer, or an unscored battle
      battles.push({ at: new Date(m.createdAt ?? 0), a: b.a, b: b.b, winner: b.winner });
    }
  }
  battles.sort((x, y) => x.at - y.at);

  const table = new Map();
  const row = (id) => {
    if (!table.has(id.key)) table.set(id.key, { ...id, elo: START, battles: 0, wins: 0, losses: 0, ties: 0, scoreSum: 0, msSum: 0, msCount: 0, highRisk: 0 });
    return table.get(id.key);
  };

  for (const battle of battles) {
    const ra = row(identity(battle.a));
    const rb = row(identity(battle.b));
    if (ra === rb) continue; // the same model on both sides (a level that fell back) is not a contest
    const sa = battle.winner === 'a' ? 1 : battle.winner === 'b' ? 0 : 0.5;
    const expectedA = 1 / (1 + 10 ** ((rb.elo - ra.elo) / 400));
    ra.elo += K * (sa - expectedA);
    rb.elo += K * (1 - sa - (1 - expectedA));
    for (const [r, side, won, lost] of [[ra, battle.a, sa === 1, sa === 0], [rb, battle.b, sa === 0, sa === 1]]) {
      r.battles++;
      if (won) r.wins++;
      else if (lost) r.losses++;
      else r.ties++;
      r.scoreSum += side.score;
      if (Number.isFinite(side.ms)) {
        r.msSum += side.ms;
        r.msCount++;
      }
      if (side.risk?.level === 'high') r.highRisk++;
    }
  }

  const leaderboard = [...table.values()]
    .map((r) => ({
      key: r.key,
      name: r.name,
      provider: r.provider,
      providerName: PROVIDER_NAMES[r.provider] ?? r.provider,
      elo: Math.round(r.elo),
      battles: r.battles,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      avgScore: Math.round((r.scoreSum / r.battles) * 10) / 10,
      avgSeconds: r.msCount ? Math.round((r.msSum / r.msCount / 1000) * 10) / 10 : null,
      highRiskShare: Math.round((r.highRisk / r.battles) * 100),
    }))
    .sort((x, y) => y.elo - x.elo || y.avgScore - x.avgScore);

  const recent = battles.slice(-5).reverse().map((b) => ({ at: b.at, a: identity(b.a).name, b: identity(b.b).name, scoreA: b.a.score, scoreB: b.b.score, winner: b.winner }));
  return { battles: battles.length, leaderboard, recent };
}

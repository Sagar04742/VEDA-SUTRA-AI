import { CrownIcon } from '../Icons.jsx';

// The match so far: wins and total Pramana points for the two contestants across every finished round of this session.
export function tally(rounds) {
  const wins = {};
  const points = {};
  const draws = { n: 0 };
  let finished = 0;
  for (const r of rounds) {
    const b = r.message.battle;
    if (r.streaming || b.a?.score == null || b.b?.score == null) continue;
    finished++;
    points[b.a.id] = (points[b.a.id] ?? 0) + b.a.score;
    points[b.b.id] = (points[b.b.id] ?? 0) + b.b.score;
    if (b.winner === 'a') wins[b.a.id] = (wins[b.a.id] ?? 0) + 1;
    else if (b.winner === 'b') wins[b.b.id] = (wins[b.b.id] ?? 0) + 1;
    else draws.n++;
  }
  return { wins, points, draws: draws.n, finished };
}

export default function Scoreboard({ rounds, a, b }) {
  const t = tally(rounds);
  if (!t.finished) return null;
  const round = (id) => ({ wins: t.wins[id] ?? 0, points: Math.round((t.points[id] ?? 0) * 10) / 10 });
  const ra = round(a.id);
  const rb = round(b.id);
  const lead = ra.wins === rb.wins ? (ra.points === rb.points ? null : ra.points > rb.points ? 'a' : 'b') : ra.wins > rb.wins ? 'a' : 'b';
  const total = Math.max(1, ra.points + rb.points);

  return (
    <section aria-label="Match scoreboard" className="scroll-panel rounded-2xl border border-gold-500/40 px-4 py-3 backdrop-blur-md">
      <p className="mb-2 text-center text-[10px] uppercase tracking-[0.35em] text-gold-300/80">
        {t.finished} round{t.finished === 1 ? '' : 's'} played{t.draws ? ` · ${t.draws} draw${t.draws === 1 ? '' : 's'}` : ''}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-left">
          <p className="flex items-center gap-1.5 truncate font-serif text-lg text-side-a">{lead === 'a' && <CrownIcon width={16} height={16} className="text-gold-300" />}<span className="truncate">{a.name}</span></p>
          <p className="text-xs text-parchment/60">{ra.points} points</p>
        </div>
        <p className="font-sans text-3xl font-semibold tabular-nums text-parchment" aria-label={`${ra.wins} to ${rb.wins}`}>
          <span className="text-side-a">{ra.wins}</span><span className="mx-2 text-parchment/40">:</span><span className="text-side-b">{rb.wins}</span>
        </p>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1.5 truncate font-serif text-lg text-side-b"><span className="truncate">{b.name}</span>{lead === 'b' && <CrownIcon width={16} height={16} className="text-gold-300" />}</p>
          <p className="text-xs text-parchment/60">{rb.points} points</p>
        </div>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10" role="presentation">
        <span className="bg-side-a transition-all duration-700" style={{ width: `${(ra.points / total) * 100}%` }} />
        <span className="bg-side-b transition-all duration-700" style={{ width: `${(rb.points / total) * 100}%` }} />
      </div>
    </section>
  );
}

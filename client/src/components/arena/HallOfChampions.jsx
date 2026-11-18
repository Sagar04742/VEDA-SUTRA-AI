import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { profileApi } from '../../api/profile.js';
import { CrownIcon } from '../Icons.jsx';

// The Hall of Champions: the Elo ranking of the models from your own battles (the full table is on your profile).
export default function HallOfChampions({ refreshKey }) {
  const [arena, setArena] = useState(null);

  useEffect(() => {
    let live = true;
    profileApi.arena().then((a) => live && setArena(a)).catch(() => live && setArena({ battles: 0, leaderboard: [], recent: [] }));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  const rows = arena?.leaderboard.slice(0, 6) ?? [];
  const top = Math.max(...rows.map((r) => r.elo), 1000);
  const low = Math.min(...rows.map((r) => r.elo), top - 60);

  return (
    <aside aria-label="Hall of Champions" className="scroll-panel rounded-2xl border border-gold-500/40 p-4 backdrop-blur-md">
      <h2 className="flex items-center gap-2 font-serif text-xl text-gold-200"><CrownIcon width={20} height={20} className="text-gold-300" /> Hall of Champions</h2>
      <p className="mb-3 text-[11px] text-parchment/55">Elo ratings from your battles. Every result was decided by Pramana.</p>
      {!arena && <p className="text-xs text-parchment/50">Loading…</p>}
      {arena && !rows.length && <p className="text-sm text-parchment/70">No champions yet. Finish a debate and the winner will take the first place here.</p>}
      <ol className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.key} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="w-5 text-center">{i === 0 ? <CrownIcon width={16} height={16} className="inline text-gold-300" /> : <span className="text-parchment/45">{i + 1}</span>}</span>
              <span className="min-w-0 flex-1 truncate text-parchment">{r.name}</span>
              <span className="font-semibold tabular-nums text-gold-200">{r.elo}</span>
            </div>
            <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-gradient-to-r from-side-a to-side-b" style={{ width: `${Math.max(8, ((r.elo - low) / (top - low || 1)) * 100)}%` }} />
            </div>
            <p className="ml-7 text-[10px] text-parchment/45">{r.wins}W {r.losses}L {r.ties}D · avg {r.avgScore}/10{r.avgSeconds != null ? ` · ${r.avgSeconds}s` : ''}</p>
          </li>
        ))}
      </ol>
      {arena && arena.battles > 0 && <Link to="/profile" className="mt-3 inline-block text-xs text-gold-300 underline underline-offset-2 hover:text-gold-200">Full leaderboard on your profile</Link>}
    </aside>
  );
}

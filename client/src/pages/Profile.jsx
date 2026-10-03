import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { profileApi } from '../api/profile.js';
import { errorMessage } from '../api/client.js';
import { ChartIcon, CheckIcon, FlameIcon, HomeIcon, LockIcon, LogoutIcon, LotusIcon, ChevronLeft } from '../components/Icons.jsx';

const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Tile({ label, value, hint, Icon }) {
  return (
    <div className="rounded-2xl border border-gold-500/25 bg-ink-900/70 p-4">
      <div className="flex items-center justify-between text-parchment/50">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        {Icon && <Icon width={18} height={18} className="text-gold-400" />}
      </div>
      <p className="mt-2 font-serif text-4xl font-semibold text-gold-200">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-parchment/50">{hint}</p>}
    </div>
  );
}

const Card = ({ title, children, className = '' }) => (
  <section className={`rounded-2xl border border-gold-500/25 bg-ink-900/70 p-5 ${className}`}>
    <h2 className="mb-4 font-serif text-2xl text-parchment">{title}</h2>
    {children}
  </section>
);

// Questions per day for the last two weeks, as bars.
function ActivityChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.questions));
  return (
    <div role="img" aria-label={`Questions asked per day over the last ${days.length} days`}>
      <div className="flex h-36 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${dayLabel(d.date)}: ${d.questions} question${d.questions === 1 ? '' : 's'}`}>
            <div
              className={`w-full rounded-t-md transition-all ${d.questions ? 'bg-gradient-to-t from-gold-600 to-gold-300' : 'bg-white/5'}`}
              style={{ height: `${d.questions ? Math.max(8, (d.questions / max) * 100) : 4}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-parchment/40">
        <span>{dayLabel(days[0].date)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

const MIX = [
  ['calculation', 'Calculations', '#e3c487'],
  ['vedic', 'Vedic maths ideas', '#d3a95c'],
  ['ancient', 'Ancient science', '#7dd3c0'],
  ['other', 'Other', '#8b8378'],
];

// Donut: what the questions were about.
function MixDonut({ mix }) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="What your questions were about">
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
        {total > 0 &&
          MIX.map(([key, , color]) => {
            const len = (mix[key] / total) * C;
            const el = mix[key] > 0 && <circle key={key} cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {MIX.map(([key, label, color]) => (
          <li key={key} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
            <span className="text-parchment/80">{label}</span>
            <span className="ml-auto pl-4 tabular-nums text-parchment/50">{mix[key]}{total ? ` · ${Math.round((mix[key] / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ items, empty }) {
  if (!items.length) return <p className="text-sm text-parchment/50">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.name}>
          <div className="flex justify-between text-sm"><span className="text-parchment/85">{it.name}</span><span className="tabular-nums text-parchment/50">{it.count}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${(it.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    profileApi.stats().then(setData).catch((e) => setError(errorMessage(e)));
  }, []);

  const stats = data?.stats;
  const memberSince = data?.user.memberSince && new Date(data.user.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-dvh bg-ink-950 text-parchment">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <Link to="/chat" className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-parchment/70 hover:bg-white/5 hover:text-gold-300"><ChevronLeft width={18} height={18} /> Back to chat</Link>
          <Link to="/" className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-parchment/70 hover:bg-white/5 hover:text-gold-300"><HomeIcon width={16} height={16} /> Home</Link>
          <button
            onClick={async () => {
              navigate('/'); // first leave the private page, otherwise the route guard sends you to /login
              await logout();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-1 text-sm text-red-300 hover:bg-red-950/40"
          >
            <LogoutIcon width={16} height={16} /> Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        {/* Identity */}
        <section className="relative overflow-hidden rounded-3xl border border-gold-500/40 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 p-6 sm:p-8">
          <LotusIcon className="pointer-events-none absolute -right-6 -top-6 text-gold-500/10" width={220} height={220} strokeWidth={0.6} aria-hidden />
          <div className="relative flex flex-wrap items-center gap-5">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 font-serif text-4xl font-bold text-ink-950 ring-4 ring-gold-500/20">
              {user.name.trim()[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-serif text-4xl font-semibold">{user.name}</h1>
              <p className="truncate text-parchment/60">{user.email}{memberSince ? ` · learning since ${memberSince}` : ''}</p>
              {stats && (
                <div className="mt-4 max-w-md">
                  <div className="flex items-baseline justify-between">
                    <span className="font-serif text-2xl text-gold-200">{stats.level.title}</span>
                    <span className="text-xs text-parchment/50">{stats.level.next ? `${stats.totals.questions} / ${stats.level.next.at} questions to ${stats.level.next.title}` : 'Highest level reached'}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats.level.progress * 100)} aria-label="Progress to the next level">
                    <div className="h-full rounded-full bg-gradient-to-r from-gold-600 via-gold-300 to-gold-200 transition-all" style={{ width: `${Math.round(stats.level.progress * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/60 px-4 py-3 text-red-200">Could not load your stats: {error}</p>}
        {!stats && !error && (
          <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-5" aria-busy="true" aria-label="Loading your statistics">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-28 rounded-2xl bg-white/5" />)}
          </div>
        )}

        {stats && stats.totals.questions === 0 && (
          <section className="rounded-2xl border border-dashed border-gold-500/40 bg-ink-900/50 p-8 text-center">
            <ChartIcon className="mx-auto text-gold-400" width={36} height={36} />
            <h2 className="mt-3 font-serif text-3xl">Your journey starts with one question</h2>
            <p className="mt-2 text-parchment/60">Once you ask something, this page fills with your activity, topics, techniques and badges.</p>
            <Link to="/chat" className="mt-5 inline-block rounded-full bg-gold-300 px-6 py-2.5 font-medium text-ink-950 hover:bg-gold-200">Ask your first question</Link>
          </section>
        )}

        {stats && stats.totals.questions > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Tile label="Questions" value={stats.totals.questions} hint="you have asked" />
              <Tile label="Conversations" value={stats.totals.chats} hint="so far" />
              <Tile label="Calculations" value={stats.totals.calculations} hint="solved step by step" />
              <Tile label="Days learned" value={stats.totals.activeDays} hint="with at least one question" />
              <Tile label="Streak" value={stats.streak.current} hint={`best: ${stats.streak.longest} day${stats.streak.longest === 1 ? '' : 's'}`} Icon={FlameIcon} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Last 14 days"><ActivityChart days={stats.perDay} /></Card>
              <Card title="What you explore"><MixDonut mix={stats.mix} /></Card>
              <Card title="Techniques you have used">
                <Bars items={stats.techniques} empty="Ask a calculation, such as “Multiply 98 × 97”, to see techniques here." />
              </Card>
              <Card title="Languages you ask in">
                <Bars items={stats.languages} empty="No questions yet." />
              </Card>
            </div>

            <Card title="Badges">
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stats.badges.map((b) => (
                  <li key={b.id} className={`rounded-xl border p-4 ${b.earned ? 'border-gold-400/60 bg-gold-500/10' : 'border-white/5 bg-white/[0.02] opacity-60'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`grid h-8 w-8 place-items-center rounded-full ${b.earned ? 'bg-gold-300 text-ink-950' : 'bg-white/10 text-parchment/50'}`}>
                        {b.earned ? <CheckIcon width={16} height={16} /> : <LockIcon width={14} height={14} />}
                      </span>
                      <span className="font-serif text-lg leading-tight">{b.name}</span>
                    </div>
                    <p className="mt-2 text-xs text-parchment/60">{b.description}</p>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Recent questions">
              <ul className="divide-y divide-white/5">
                {stats.recent.map((q, i) => (
                  <li key={`${q.chatId}-${i}`}>
                    <Link to={`/chat/c/${q.chatId}`} className="flex items-baseline gap-4 rounded-lg px-1 py-2.5 hover:bg-white/5">
                      <span className="min-w-0 flex-1 truncate">{q.text || '(picture)'}</span>
                      <time className="shrink-0 text-xs text-parchment/40" dateTime={q.at}>{new Date(q.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

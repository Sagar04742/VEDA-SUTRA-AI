import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useConversation } from '../hooks/useConversation.js';
import { useModelTier } from '../hooks/useModelTier.js';
import { useReadiness } from '../hooks/useReadiness.js';
import ReadyBadge from '../components/arena/ReadyBadge.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import BattleCard from '../components/BattleCard.jsx';
import PramanaPanel from '../components/PramanaPanel.jsx';
import ContestantPicker from '../components/arena/ContestantPicker.jsx';
import DebateColumn from '../components/arena/DebateColumn.jsx';
import QuestionScroll from '../components/arena/QuestionScroll.jsx';
import Scoreboard from '../components/arena/Scoreboard.jsx';
import HallOfChampions from '../components/arena/HallOfChampions.jsx';
import { ChevronLeft, CrownIcon, SwordsIcon, UserIcon } from '../components/Icons.jsx';

// Sparks rising from each side of the stage: gold on the left, sapphire on the right.
const EMBERS = Array.from({ length: 22 }, (_, i) => {
  const r = (n) => (Math.sin(i * 61.7 + n * 17.3) + 1) / 2;
  const left = i % 2 === 0;
  return { side: left ? 'a' : 'b', x: left ? 2 + r(1) * 40 : 58 + r(1) * 40, size: 2 + Math.round(r(2) * 3), delay: r(3) * 9, duration: 6 + r(4) * 7 };
});

// The rounds of this session: every battle message, with the question that was asked.
function roundsOf(messages) {
  const rounds = [];
  messages.forEach((m, i) => {
    if (m.role !== 'assistant' || !m.battle) return;
    rounds.push({ id: m.id, question: messages[i - 1]?.role === 'user' ? messages[i - 1].content : '', message: m, streaming: Boolean(m.streaming) });
  });
  return rounds;
}

const sideInfo = (arena, id) => arena.find((c) => c.id === id) ?? { id, name: id };

// Shastrarth (शास्त्रार्थ): the dedicated arena. Two contestants, one question, and Pramana as the judge.
export default function Shastrarth() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeId = useMatch('/shastrarth/c/:id')?.params.id;
  const picker = useModelTier();
  const [a, setA] = useState('lite');
  const [b, setB] = useState('pro');
  const [text, setText] = useState(() => location.state?.question ?? '');
  const [options, setOptions] = useState({ webSearch: false, deepExplain: false });
  const [champKey, setChampKey] = useState(0);
  const askRef = useRef(null);

  const conv = useConversation({
    onChatCreated: useCallback((chat) => navigate(`/shastrarth/c/${chat.id}`, { replace: true }), [navigate]),
    onChatDiscarded: useCallback(() => navigate('/shastrarth', { replace: true }), [navigate]),
    onTitle: () => {},
    onActivity: useCallback(() => setChampKey((k) => k + 1), []),
  });
  const { messages, streaming, loading, error, chatIdRef } = conv;
  const rounds = useMemo(() => roundsOf(messages), [messages]);
  const current = rounds.at(-1);
  const previous = rounds.slice(0, -1);

  // Keep the open session in sync with the URL (the same way the chat page does).
  useEffect(() => {
    if (!routeId) {
      if (chatIdRef.current) conv.reset();
      return;
    }
    if (routeId !== chatIdRef.current) conv.load(routeId).then((ok) => ok || navigate('/shastrarth', { replace: true }));
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reopening a session: line the contestants up the way the last round had them.
  const lastRoundId = current?.message.battle?.a?.id && !current.streaming ? `${current.message.battle.a.id}|${current.message.battle.b.id}` : null;
  const seeded = useRef(null);
  useEffect(() => {
    if (!lastRoundId || seeded.current === lastRoundId || routeId === undefined) return;
    seeded.current = lastRoundId;
    const [ra, rb] = lastRoundId.split('|');
    if (picker.arena.some((c) => c.id === ra)) setA(ra);
    if (picker.arena.some((c) => c.id === rb)) setB(rb);
  }, [lastRoundId, routeId, picker.arena]);

  // Sensible starting contestants once the list is known: the first two that are ready.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !picker.arena.length || routeId) return;
    defaulted.current = true;
    const ready = (id) => picker.arena.find((c) => c.id === id && c.available !== false);
    if (!ready(a) || !ready(b)) {
      const open = picker.arena.filter((c) => c.available !== false);
      if (open[0]) setA(open[0].id);
      if (open[1]) setB(open[1].id);
    }
  }, [picker.arena]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (side) => (id) => {
    const other = side === 'a' ? b : a;
    if (id === other) (side === 'a' ? setB : setA)(side === 'a' ? a : b); // choosing the opponent's pick swaps them
    (side === 'a' ? setA : setB)(id);
  };

  const A = sideInfo(picker.arena, a);
  const B = sideInfo(picker.arena, b);
  const down = [A, B].find((c) => c.available === false);
  const ready = useReadiness(a, b, picker.arena.length >= 2);
  const blocked = [A, B].find((c) => ready.of(c.id).state === 'blocked');
  const canBegin = Boolean(text.trim()) && a !== b && !down && !blocked && ready.both && !streaming && picker.arena.length >= 2;
  const why = !picker.arena.length ? 'Loading the contestants…' : !text.trim() ? 'Write a question first.' : a === b ? 'Pick two different contestants.' : down ? `${down.name} is unavailable right now.` : blocked ? `${blocked.name} is not ready: ${ready.of(blocked.id).result?.reason ?? 'it did not answer'}.` : ready.checking ? 'The security check is running…' : '';

  const send = (question, first = a, second = b) => {
    const names = Object.fromEntries(picker.arena.map((c) => [c.id, c.name]));
    conv.send({ content: question, images: [], ...options, webSearch: options.webSearch && picker.capabilities.webSearch, tier: 'lite', battle: { a: first, b: second, names } });
  };
  // Before the debate starts, the contestants are checked once more (instant if they were checked a moment ago).
  const begin = async () => {
    if (!canBegin) return;
    const verdict = await ready.verify();
    if (verdict && [a, b].some((id) => verdict[id]?.state === 'blocked')) return; // the badges now say why
    const q = text;
    setText('');
    send(q);
  };
  // Same question again with the sides swapped: does the winner stay the winner?
  const rematch = () => {
    if (!current || streaming) return;
    const [x, y] = [b, a];
    setA(x);
    setB(y);
    send(current.question, x, y);
  };
  const fresh = () => {
    askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('sabha-question')?.focus();
  };

  // Phase decides how tall the stage is: tall before the first round, compact once a debate is under way.
  const idle = !rounds.length && !loading;
  const battle = current?.message.battle;
  const scored = battle && battle.a.score != null && battle.b.score != null;
  const lastWinner = battle?.winner;

  return (
    <div className="relative min-h-dvh text-parchment">
      <div className="arena-bg" aria-hidden />

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-gold-500/15 bg-ink-950/45 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link to="/chat" className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-parchment/75 hover:bg-white/5 hover:text-gold-300"><ChevronLeft width={18} height={18} /> Chat</Link>
          <p className="flex items-center gap-2 font-serif text-xl text-gold-200"><SwordsIcon width={20} height={20} className="text-gold-300" /> Shastrarth <span className="font-deva text-lg text-parchment/80">शास्त्रार्थ</span></p>
          <ThemeToggle className="ml-auto h-9 w-9" />
          <Link to="/profile" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-parchment/75 hover:bg-white/5 hover:text-gold-300"><UserIcon width={16} height={16} /> Profile</Link>
        </div>
      </header>

      {/* The stage: the two scholars of the artwork, and the contestants who stand for them */}
      <section aria-label="The stage" className={`relative z-30 flex flex-col justify-end transition-[min-height] duration-700 ${idle ? 'min-h-[46vh] sm:min-h-[50vh]' : 'min-h-[30vh] sm:min-h-[34vh]'}`}>
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {EMBERS.map((e, i) => (
            <span key={i} className={`ember ember-${e.side}`} style={{ left: `${e.x}%`, width: e.size, height: e.size, animationDelay: `${e.delay}s`, animationDuration: `${e.duration}s` }} />
          ))}
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 pb-4 pt-6">
          {idle && (
            <div className="arena-heading mb-6 text-center">
              <h1 className="arena-title fade-up font-deva text-5xl font-semibold text-parchment drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-7xl">शास्त्रार्थ</h1>
              <p className="arena-sub fade-up mt-1 font-serif text-xl text-parchment/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-2xl" style={{ animationDelay: '120ms' }}>Two minds. One question. <span className="shimmer-text">Pramana</span> judges.</p>
            </div>
          )}
          <div className="grid grid-cols-2 items-end gap-2 sm:gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
            <Plaque tone="a" label="Contestant A" subtitle="gold" winner={lastWinner === 'a'} loser={scored && lastWinner === 'b'}>
              <ContestantPicker arena={picker.arena} value={a} other={b} onChange={pick('a')} tone="a" />
              <ReadyBadge status={ready.of(a)} onRecheck={ready.recheck} />
            </Plaque>
            <div className="hidden text-center md:block">
              {/* the artwork already says VS: the badge only appears once the stage is compact */}
              {!idle && <span className={`inline-grid h-14 w-14 place-items-center rounded-full border-2 border-gold-300 bg-ink-900/80 font-serif text-xl font-bold text-gold-200 backdrop-blur ${streaming ? 'clash' : ''}`}>VS</span>}
            </div>
            <Plaque tone="b" label="Contestant B" subtitle="sapphire" winner={lastWinner === 'b'} loser={scored && lastWinner === 'a'}>
              <ContestantPicker arena={picker.arena} value={b} other={a} onChange={pick('b')} tone="b" />
              <ReadyBadge status={ready.of(b)} onRecheck={ready.recheck} />
            </Plaque>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-16">
        <div className={idle ? 'mx-auto max-w-3xl space-y-5' : 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]'}>
          <div className="min-w-0 space-y-5">
            {loading && <p className="text-center text-parchment/60">Opening the debate…</p>}

            {/* The question: ceremonial before the first round, a compact bar after it */}
            {!current || !streaming ? (
              <div ref={askRef}>
                <QuestionScroll
                  value={text}
                  onChange={setText}
                  onBegin={begin}
                  onStop={conv.stop}
                  streaming={streaming}
                  options={{ ...options, webSearch: options.webSearch && picker.capabilities.webSearch }}
                  onOptions={setOptions}
                  canBegin={canBegin}
                  why={why}
                  round={rounds.length}
                  webSearchAvailable={picker.capabilities.webSearch}
                  autoFocus={idle}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <button onClick={conv.stop} className="flex items-center gap-2 rounded-full border border-gold-300/70 bg-ink-800/90 px-6 py-2 font-medium text-gold-200 backdrop-blur hover:bg-ink-700">Stop the debate</button>
              </div>
            )}

            {error && <ErrorBanner error={error} onRetry={conv.retry} onDismiss={conv.dismissError} />}

            <Scoreboard rounds={rounds} a={A} b={B} />

            {/* The round on the stage */}
            {current && battle && (
              <div className="space-y-4" data-testid="arena-round">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.35em] text-gold-300/80">Round {rounds.length}</p>
                  <p className="mx-auto mt-1 max-w-3xl font-serif text-2xl text-parchment sm:text-3xl">&ldquo;{current.question}&rdquo;</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <DebateColumn side={battle.a} tone="a" streaming={current.streaming} isWinner={lastWinner === 'a'} finished={scored} />
                  <DebateColumn side={battle.b} tone="b" streaming={current.streaming} isWinner={lastWinner === 'b'} finished={scored} />
                </div>
                {scored && <PramanaPanel a={battle.a} b={battle.b} winner={battle.winner} margin={battle.margin} evidence={battle.evidence} judgedMs={battle.judgedMs} />}
                {!scored && !current.streaming && <p className="text-center text-xs text-parchment/60">{battle.unscored || 'No score: nothing could be checked for this question.'}</p>}
                {current.streaming && !scored && <p className="text-center text-xs text-parchment/55">Pramana will judge both answers when they are finished.</p>}

                {!current.streaming && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button onClick={rematch} className="flex items-center gap-2 rounded-full border border-gold-300/60 bg-gold-500/15 px-5 py-2 text-sm text-gold-200 transition hover:bg-gold-500/30"><SwordsIcon width={16} height={16} /> Rematch with sides swapped</button>
                    <button onClick={fresh} className="rounded-full border border-white/15 px-5 py-2 text-sm text-parchment/80 transition hover:border-gold-500/50 hover:text-gold-200">Ask a new question</button>
                  </div>
                )}
              </div>
            )}

            {/* Earlier rounds of this session */}
            {previous.length > 0 && (
              <section aria-label="Earlier rounds" className="space-y-2">
                <h2 className="font-serif text-xl text-parchment/90">Earlier rounds</h2>
                {[...previous].reverse().map((r, i) => {
                  const bt = r.message.battle;
                  const n = previous.length - i;
                  return (
                    <details key={r.id} className="group rounded-xl border border-gold-500/30 bg-ink-900/70 backdrop-blur-md">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                        <span className="text-xs text-parchment/50">Round {n}</span>
                        <span className="min-w-0 flex-1 truncate font-serif text-lg">{r.question || '(picture)'}</span>
                        <span className="text-xs"><span className={bt.winner === 'a' ? 'font-semibold text-side-a' : 'text-parchment/60'}>{bt.a.name} {bt.a.score ?? '–'}</span> <span className="text-parchment/35">vs</span> <span className={bt.winner === 'b' ? 'font-semibold text-side-b' : 'text-parchment/60'}>{bt.b.name} {bt.b.score ?? '–'}</span></span>
                        {bt.winner && bt.winner !== 'tie' && <CrownIcon width={16} height={16} className="text-gold-300" />}
                      </summary>
                      <div className="border-t border-white/5 p-3"><BattleCard message={r.message} /></div>
                    </details>
                  );
                })}
              </section>
            )}
          </div>

          <div className={idle ? '' : 'space-y-5 xl:sticky xl:top-20 xl:self-start'}>
            <HallOfChampions refreshKey={champKey} />
          </div>
        </div>
      </main>
    </div>
  );
}

// The frame around a contestant's picker, in that contestant's colour.
function Plaque({ tone, label, subtitle, winner, loser, children }) {
  const colour = tone === 'a' ? 'text-side-a' : 'text-side-b';
  return (
    <div className={`rounded-2xl bg-ink-900/70 p-3 backdrop-blur-md transition duration-700 ${tone === 'a' ? 'plaque-a' : 'plaque-b'} ${loser ? 'opacity-60' : ''}`}>
      <p className={`mb-1.5 flex items-center gap-1.5 whitespace-nowrap text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] ${colour}`}>
        {winner && <CrownIcon width={13} height={13} className="crown-drop text-gold-300" />} <span className="hidden sm:inline">Contestant </span>{label.slice(-1)} <span className="hidden text-parchment/40 sm:inline">· {subtitle}</span>
      </p>
      {children}
    </div>
  );
}

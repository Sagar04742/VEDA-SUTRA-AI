import { useEffect, useMemo, useRef } from 'react';
import { GlobeIcon, SparkIcon, StopIcon, SwordsIcon } from '../Icons.jsx';

// Questions that show off the difference between models: a calculation, a sourced fact, a trap, a Hindi question.
export const SABHA_QUESTIONS = [
  'Multiply 98 × 97 using a Vedic technique',
  'What is the Delhi Iron Pillar?',
  'Did the Kerala school invent calculus?',
  'What did Aryabhata contribute to astronomy?',
  'Is 2184 divisible by 8?',
  'वैदिक गणित में वर्ग करने की सबसे आसान विधि क्या है?',
  'What is the Nikhilam sutra and when do I use it?',
  'How were bhasmas prepared in Rasashastra?',
  'Did ancient India really have flying vimanas?',
  'What is the square of 95?',
];

function Pill({ on, onClick, Icon, children, title }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${on ? 'border-gold-300 bg-gold-500/25 text-gold-200' : 'border-white/10 bg-ink-900/60 text-parchment/60 hover:border-gold-500/40'}`}>
      <Icon width={14} height={14} /> {children}
    </button>
  );
}

// Where the question is posed. Large and ceremonial before the first round, compact for the next ones.
export default function QuestionScroll({ value, onChange, onBegin, onStop, streaming, options, onOptions, canBegin, why, round, webSearchAvailable = true, autoFocus }) {
  const ref = useRef(null);
  const ideas = useMemo(() => [...SABHA_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 3), []);
  const first = round === 0;

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    el.style.overflowY = el.scrollHeight > 150 ? 'auto' : 'hidden'; // no scrollbar handle for a short question
  }, [value]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canBegin && !streaming) onBegin();
    }
  };

  // Later rounds: one slim bar, so the debate stays the star of the page.
  if (!first) {
    return (
      <section aria-label="Pose a question" className="scroll-panel flex flex-wrap items-center gap-2 rounded-2xl border border-gold-500/50 px-3 py-2.5 backdrop-blur-md sm:flex-nowrap">
        <label htmlFor="sabha-question" className="shrink-0 text-[10px] uppercase tracking-[0.25em] text-gold-300/90">Round {round + 1}</label>
        <textarea
          id="sabha-question"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={4000}
          disabled={streaming}
          placeholder="The next question…"
          className="min-w-0 flex-1 basis-48 resize-none rounded-lg border border-gold-500/30 bg-ink-950/60 px-3 py-2 text-base text-parchment outline-none transition placeholder:text-parchment/40 focus:border-gold-300"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill on={options.webSearch && webSearchAvailable} onClick={() => onOptions({ ...options, webSearch: !options.webSearch })} Icon={GlobeIcon} title="Both contestants may search the web (Wikipedia)">Web</Pill>
          <Pill on={options.deepExplain} onClick={() => onOptions({ ...options, deepExplain: !options.deepExplain })} Icon={SparkIcon} title="Both give their most thorough answer">Deep</Pill>
          {streaming ? (
            <button type="button" onClick={onStop} className="flex items-center gap-1.5 rounded-full border border-gold-300/70 bg-ink-800 px-4 py-1.5 text-sm text-gold-200"><StopIcon width={14} height={14} /> Stop</button>
          ) : (
            <button type="button" onClick={onBegin} disabled={!canBegin} title={canBegin ? undefined : why} className="edge-sweep flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-ink-950 transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"><SwordsIcon width={15} height={15} /> Next round</button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Pose a question" className="scroll-panel rounded-2xl border border-gold-500/50 p-4 backdrop-blur-md sm:p-5">
      <label htmlFor="sabha-question" className="mb-2 block text-center text-[11px] uppercase tracking-[0.35em] text-gold-300/90">
        {first ? 'Pose the question to the sabha' : `Round ${round + 1}: the next question`}
      </label>
      <textarea
        id="sabha-question"
        ref={ref}
        rows={first ? 2 : 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={4000}
        disabled={streaming}
        placeholder="Ask anything about Vedic maths or ancient science…"
        className="w-full resize-none rounded-xl border border-gold-500/30 bg-ink-950/60 px-4 py-3 text-center font-serif text-xl text-parchment outline-none transition placeholder:font-sans placeholder:text-base placeholder:text-parchment/40 focus:border-gold-300 sm:text-2xl"
      />

      {first && !streaming && (
        <ul className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Question ideas">
          {ideas.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => onChange(q)} className="rounded-full border border-gold-500/40 bg-ink-900/60 px-3 py-1 text-xs text-gold-200 transition hover:-translate-y-0.5 hover:border-gold-300 hover:bg-gold-500/20">
                {q.length > 48 ? `${q.slice(0, 46)}…` : q}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Pill on={options.webSearch && webSearchAvailable} onClick={() => onOptions({ ...options, webSearch: !options.webSearch })} Icon={GlobeIcon} title="Both contestants may search the web (Wikipedia). The search is shown live.">Web search</Pill>
        <Pill on={options.deepExplain} onClick={() => onOptions({ ...options, deepExplain: !options.deepExplain })} Icon={SparkIcon} title="Both give their longest, most thorough answer">Deep explain</Pill>
        {streaming ? (
          <button type="button" onClick={onStop} className="flex items-center gap-2 rounded-full border border-gold-300/70 bg-ink-800 px-6 py-2 font-medium text-gold-200 transition hover:bg-ink-700">
            <StopIcon width={16} height={16} /> Stop the debate
          </button>
        ) : (
          <button
            type="button"
            onClick={onBegin}
            disabled={!canBegin}
            title={canBegin ? undefined : why}
            className="edge-sweep group flex items-center gap-2 rounded-full px-7 py-2.5 font-semibold text-ink-950 shadow-lg shadow-black/30 transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"
          >
            <SwordsIcon width={18} height={18} /> {first ? 'Begin the debate' : 'Next round'}
          </button>
        )}
      </div>
      {!canBegin && !streaming && why && <p className="mt-2 text-center text-xs text-parchment/55">{why}</p>}
    </section>
  );
}

import { AnswerBody } from './AnswerParts.jsx';
import PramanaPanel from './PramanaPanel.jsx';
import { BoltIcon, ClockIcon, CrownIcon, GlobeIcon, LotusIcon } from './Icons.jsx';

const PROVIDERS = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral', openai: 'OpenAI', cohere: 'Cohere' };

// "gemini · gemini-3.8-flash", and who really answered if a level had to fall back
function whoAnswered(side) {
  const by = side.answeredBy;
  const provider = by?.provider ?? side.provider;
  const model = by?.model ?? side.model;
  return provider && model ? `${PROVIDERS[provider] ?? provider} · ${model}` : '';
}

function Nameplate({ side, tone, isWinner, finished, align }) {
  const colour = tone === 'a' ? 'text-side-a' : 'text-side-b';
  const dim = finished && !isWinner;
  return (
    <div className={`min-w-0 flex-1 ${align === 'right' ? 'text-right' : 'text-left'} transition-opacity duration-700 ${dim ? 'opacity-60' : ''}`}>
      <p className={`flex items-center gap-1.5 font-serif text-xl leading-tight sm:text-2xl ${colour} ${align === 'right' ? 'justify-end' : ''}`}>
        {isWinner && align !== 'right' && <CrownIcon width={20} height={20} className="crown-drop text-gold-300" />}
        <span className="truncate">{side.name}</span>
        {isWinner && align === 'right' && <CrownIcon width={20} height={20} className="crown-drop text-gold-300" />}
      </p>
      <p className="truncate text-[11px] text-parchment/55">{side.kind === 'level' ? 'Level' : 'Model'} {whoAnswered(side) && `· ${whoAnswered(side)}`}</p>
    </div>
  );
}

// One contestant's answer: header with timing and status, the live work log, then the answer.
function Column({ side, tone, streaming, isWinner }) {
  const running = streaming && !side.done && !side.error;
  const accent = tone === 'a' ? 'border-t-side-a' : 'border-t-side-b';
  const by = whoAnswered(side);
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-t-4 border-gold-500/30 bg-ink-900/70 shadow-lg shadow-black/10 backdrop-blur-md ${accent} ${isWinner ? (tone === 'a' ? 'shadow-side-a' : 'shadow-side-b') : ''}`} aria-label={`${side.name} answer`}>
      <header className="flex items-center gap-2 border-b border-gold-500/20 px-4 py-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-ink-800 ${tone === 'a' ? 'border-side-a/70 text-side-a' : 'border-side-b/70 text-side-b'} ${running ? 'glow-pulse' : ''}`}>
          <LotusIcon width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight text-parchment">{side.name}</p>
          <p className="truncate text-[11px] text-parchment/50">
            {running ? 'Working on it…' : side.error ? 'No answer' : by || 'Finished'}
            {!running && by && side.answeredBy?.label && side.answeredBy.label !== side.name ? ` (answered as ${side.answeredBy.label})` : ''}
          </p>
        </div>
        {isWinner && <span className="flex items-center gap-1 rounded-full bg-gold-300 px-2.5 py-0.5 text-xs font-semibold text-ink-950"><CrownIcon width={12} height={12} /> Winner</span>}
        {side.score != null && (
          <span className="rounded-full border border-gold-400/60 px-2.5 py-0.5 font-sans text-sm font-semibold tabular-nums text-gold-200" aria-label={`Score ${side.score} out of 10`}>
            {side.score}<span className="text-xs opacity-60">/10</span>
          </span>
        )}
      </header>

      {!running && !side.error && (side.ms != null || side.words) && (
        <p className="flex gap-3 border-b border-white/5 px-4 py-1.5 text-[11px] text-parchment/50">
          {side.ms != null && <span className="flex items-center gap-1"><ClockIcon width={12} height={12} /> {(side.ms / 1000).toFixed(1)}s</span>}
          {side.words > 0 && <span>{side.words} words</span>}
        </p>
      )}

      <div className="min-w-0 flex-1 px-4 py-3">
        {side.notice && (
          <p role="status" className="mb-2 flex items-start gap-2 rounded-lg border border-white/10 bg-ink-800/60 px-3 py-1.5 text-xs text-parchment/75">
            <GlobeIcon className="mt-0.5 shrink-0 text-gold-400" width={14} height={14} /> {side.notice}
          </p>
        )}
        {side.error ? (
          <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-parchment/85">
            {side.error.message} This contestant has no answer, so it is not scored.
          </p>
        ) : (
          <AnswerBody message={{ ...side, streaming: running }} warnUngrounded />
        )}
      </div>
    </section>
  );
}

// Shastrarth (शास्त्रार्थ): the traditional Indian debate between scholars. Two contestants answer the same question;
// Pramana judges them.
export default function BattleCard({ message }) {
  const { a, b, winner, margin, evidence, judgedMs, unscored } = message.battle;
  const streaming = Boolean(message.streaming);
  const scored = a.score != null || b.score != null;
  const finished = scored;

  return (
    <div className="pop-in space-y-4" data-testid="battle">
      <div className="relative overflow-hidden rounded-2xl border border-gold-500/40 bg-gradient-to-r from-side-a/20 via-ink-900/90 to-side-b/20 bg-ink-900/85 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Nameplate side={a} tone="a" isWinner={winner === 'a'} finished={finished} />
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-gold-300 bg-ink-900 font-serif text-lg font-bold text-gold-200 ${streaming ? 'vs-pulse' : ''}`}>VS</span>
          <Nameplate side={b} tone="b" isWinner={winner === 'b'} finished={finished} align="right" />
        </div>
        <p className="mt-1 text-center text-[10px] uppercase tracking-[0.35em] text-gold-300/80"><span className="font-deva normal-case tracking-normal">शास्त्रार्थ</span> &nbsp;·&nbsp; Shastrarth &nbsp;·&nbsp; Battle of the models</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Column side={a} tone="a" streaming={streaming} isWinner={winner === 'a'} />
        <Column side={b} tone="b" streaming={streaming} isWinner={winner === 'b'} />
      </div>

      {scored && <PramanaPanel a={a} b={b} winner={winner} margin={margin} evidence={evidence} judgedMs={judgedMs} />}
      {!scored && !streaming && <p className="text-center text-xs text-parchment/60">{unscored || 'No score: nothing could be checked for this question.'}</p>}
      {streaming && !scored && (
        <p className="flex items-center justify-center gap-2 text-center text-xs text-parchment/55"><BoltIcon width={14} height={14} className="text-gold-300" /> Pramana will judge both answers when they are finished.</p>
      )}
    </div>
  );
}

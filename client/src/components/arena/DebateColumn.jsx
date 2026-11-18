import { AnswerBody } from '../AnswerParts.jsx';
import LiveClock from './LiveClock.jsx';
import { Seal } from '../PramanaPanel.jsx';
import { CrownIcon, GlobeIcon, LotusIcon } from '../Icons.jsx';

const PROVIDERS = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral', openai: 'OpenAI', cohere: 'Cohere' };

// One contestant's side of the debate: a "scroll" with their live work, their answer and, at the end, their verdict.
export default function DebateColumn({ side, tone, streaming, isWinner, finished }) {
  const running = streaming && !side.done && !side.error;
  const colour = tone === 'a' ? 'text-side-a' : 'text-side-b';
  const ring = tone === 'a' ? 'border-side-a' : 'border-side-b';
  const by = side.answeredBy ?? side;
  const model = by.provider && by.model ? `${PROVIDERS[by.provider] ?? by.provider} · ${by.model}` : '';

  return (
    <section
      aria-label={`${side.name} answer`}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-ink-900/88 shadow-lg shadow-black/20 backdrop-blur-md transition duration-700 ${ring}/50 ${isWinner ? (tone === 'a' ? 'plaque-a' : 'plaque-b') : ''} ${finished && !isWinner ? 'opacity-90' : ''}`}
    >
      {/* the contestant's colour, as a glowing edge along the top */}
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${tone === 'a' ? 'bg-side-a' : 'bg-side-b'} ${running ? 'animate-pulse' : ''}`} />

      <header className="flex items-center gap-3 border-b border-gold-500/20 px-4 pb-3 pt-4">
        <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 bg-ink-800 ${ring} ${colour}`}>
          {running && <span aria-hidden className={`ring-spin absolute inset-[-5px] rounded-full border-2 border-transparent ${tone === 'a' ? 'border-t-side-a' : 'border-t-side-b'}`} />}
          <LotusIcon width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-1.5 truncate font-serif text-xl leading-tight ${colour}`}>
            {isWinner && <CrownIcon width={18} height={18} className="crown-drop shrink-0 text-gold-300" />}
            <span className="truncate">{side.name}</span>
          </p>
          <p className="truncate text-[11px] text-parchment/55">
            {running ? 'Reasoning and looking things up…' : side.error ? 'Could not answer' : model || 'Finished'}
            {!running && model && side.answeredBy?.label && side.answeredBy.label !== side.name ? ` (answered as ${side.answeredBy.label})` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <LiveClock startedAt={side.startedAt} ms={side.ms} running={running} />
          {side.score != null && (
            <span className={`rounded-full border px-2.5 py-0.5 font-sans text-sm font-semibold tabular-nums ${ring} ${colour}`} aria-label={`Score ${side.score} out of 10`}>
              {side.score}<span className="text-xs opacity-60">/10</span>
            </span>
          )}
        </div>
      </header>

      {(side.words > 0 || side.seal) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/5 px-4 py-1.5 text-[11px] text-parchment/55">
          {side.words > 0 && <span>{side.words} words</span>}
          {side.seal && <Seal seal={side.seal} />}
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

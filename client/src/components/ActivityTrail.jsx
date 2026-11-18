import { BookIcon, CheckIcon, GlobeIcon, RootIcon, ShieldIcon } from './Icons.jsx';

const PROVENANCE = {
  verified_math: { label: 'Verified maths', tone: 'border-good/60 bg-good/15 text-good' },
  traditional_text: { label: 'Traditional text', tone: 'border-gold-400/60 bg-gold-400/15 text-gold-200' },
  interpretation: { label: 'Interpretation', tone: 'border-side-b/60 bg-side-b/15 text-side-b' },
};

function Running({ it, Icon }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-gold-500/25 bg-ink-800/50 px-3 py-2 text-xs">
      <span className="glow-pulse mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold-300 text-gold-200"><Icon width={13} height={13} /></span>
      <span className="min-w-0 flex-1 text-parchment/90">
        {it.text}
        <span className="ml-1 inline-flex gap-0.5 align-middle" aria-hidden>{[0, 1, 2].map((d) => <span key={d} className="h-1 w-1 animate-bounce rounded-full bg-gold-300" style={{ animationDelay: `${d * 0.12}s` }} />)}</span>
      </span>
    </li>
  );
}

// FROM OUR DATA: the knowledge library (our own processed sources). Deliberately loud, so it is obvious that this part of
// the answer comes from VedaSutra's data and not from the model's memory.
function LibraryCard({ it }) {
  const entries = it.entries?.length ? it.entries : (it.items ?? []).map((name) => ({ name }));
  return (
    <li className="overflow-hidden rounded-xl border-2 border-good/70 bg-good/10 shadow-[0_0_28px_-10px_var(--color-good)]" data-testid="library-card">
      <div className="flex items-center gap-3 border-b border-good/30 bg-good/15 px-3 py-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-good text-ink-950 shadow-lg"><ShieldIcon width={20} height={20} strokeWidth={2.2} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-lg leading-tight text-good">From VedaSutra&rsquo;s knowledge library</span>
          <span className="block text-[11px] text-parchment/75">Our own processed data, with its source: not the model&rsquo;s memory.</span>
        </span>
        <span className="shrink-0 rounded-full bg-good px-2.5 py-0.5 text-xs font-bold text-ink-950">{it.count} {it.count === 1 ? 'entry' : 'entries'}</span>
      </div>
      <ul className="divide-y divide-good/15 px-3 py-1">
        {entries.map((e) => {
          const p = PROVENANCE[e.provenance];
          return (
            <li key={e.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-xs">
              <CheckIcon width={14} height={14} className="shrink-0 text-good" />
              <span className="font-semibold text-parchment">{e.name}</span>
              {p && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${p.tone}`}>{p.label}</span>}
              {e.source && <span className="basis-full pl-5 text-[11px] italic text-parchment/60">Source: {e.source}</span>}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function WebCard({ it }) {
  const pages = it.pages?.length ? it.pages : (it.items ?? []).map((title) => ({ title }));
  return (
    <li className="overflow-hidden rounded-xl border-2 border-side-b/60 bg-side-b/10">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-side-b text-ink-950"><GlobeIcon width={17} height={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-base leading-tight text-side-b">From the web (Wikipedia)</span>
          <span className="block text-[11px] text-parchment/70">General information, not our verified library.</span>
        </span>
        <span className="shrink-0 rounded-full bg-side-b px-2 py-0.5 text-xs font-bold text-ink-950">{it.count} {it.count === 1 ? 'page' : 'pages'}</span>
      </div>
      <ul className="flex flex-wrap gap-1.5 px-3 pb-2.5">
        {pages.map((p) => (
          <li key={p.title}>
            {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" className="rounded-full border border-side-b/50 px-2.5 py-0.5 text-[11px] text-side-b underline-offset-2 hover:underline">{p.title}</a> : <span className="rounded-full border border-side-b/50 px-2.5 py-0.5 text-[11px] text-side-b">{p.title}</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}

function SolverLine({ it }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-gold-400/40 bg-gold-500/10 px-3 py-2 text-xs">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-300 text-ink-950"><RootIcon width={14} height={14} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-gold-200">Computed by the exact Vedic solver (not guessed)</span>
        <span className="block text-parchment/80">{it.text}{it.result ? `: ${it.result}` : ''}</span>
      </span>
    </li>
  );
}

function NothingFound({ it }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-warn/50 bg-warn/10 px-3 py-2 text-xs">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-warn/70 text-warn"><BookIcon width={13} height={13} /></span>
      <span className="min-w-0 flex-1 text-parchment/85">
        <span className="block font-medium text-warn">Not found in our library</span>
        <span className="block text-parchment/70">{it.text}. Anything said about it comes from the model&rsquo;s general knowledge, not from our data.</span>
      </span>
    </li>
  );
}

// "Show your work": what the assistant is doing, step by step. A search of OUR library that found something is shown as a
// big green "from our data" card; the web and the solver have their own looks, so you always know where a fact came from.
// items = [{ id?, kind, text, running?, result?, count?, entries?, pages? }].
export default function ActivityTrail({ items }) {
  if (!items?.length) return null;
  return (
    <ol className="mb-3 space-y-2" aria-label="Where this answer comes from" data-testid="activity">
      {items.map((it, i) => {
        const key = it.id ?? i;
        const Icon = it.kind === 'web' ? GlobeIcon : it.kind === 'solver' ? RootIcon : BookIcon;
        if (it.running) return <Running key={key} it={it} Icon={Icon} />;
        if (it.kind === 'knowledge') return it.count > 0 ? <LibraryCard key={key} it={it} /> : <NothingFound key={key} it={it} />;
        if (it.kind === 'web') return it.count > 0 ? <WebCard key={key} it={it} /> : <NothingFound key={key} it={{ ...it, text: it.result || it.text }} />;
        return <SolverLine key={key} it={it} />;
      })}
    </ol>
  );
}

// A one-line verdict on where the answer came from, shown at the top of the answer.
export function SourceBadge({ items, streaming, warnUngrounded }) {
  const done = (items ?? []).filter((x) => !x.running);
  const lib = done.find((x) => x.kind === 'knowledge');
  const solved = done.some((x) => x.kind === 'solver' && !x.error);
  if (!lib && !solved) {
    // A real question answered with no look-up at all: say so, in battles where it matters.
    if (!warnUngrounded || streaming) return null;
    return (
      <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-warn/60 bg-warn/10 px-3 py-1 text-xs font-semibold text-warn" data-testid="source-badge">
        <BookIcon width={15} height={15} /> Answered from the model&rsquo;s memory, not from our library
      </p>
    );
  }
  const grounded = (lib && lib.count > 0) || solved;
  return (
    <p
      className={`mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${grounded ? 'border-good/70 bg-good/15 text-good' : 'border-warn/60 bg-warn/10 text-warn'}`}
      data-testid="source-badge"
    >
      {grounded ? <ShieldIcon width={15} height={15} strokeWidth={2.2} /> : <BookIcon width={15} height={15} />}
      {grounded ? (solved && !(lib && lib.count > 0) ? 'Computed by our exact solver' : 'Grounded in VedaSutra’s library') : 'Not in our library: general knowledge'}
      {!streaming && grounded && lib?.count > 0 && <span className="font-normal text-parchment/70">· {lib.count} {lib.count === 1 ? 'source' : 'sources'}</span>}
    </p>
  );
}

// Turn the stream of { phase: 'start' | 'done', id, ... } events into a list, one entry per tool call.
export function mergeActivity(list = [], event) {
  const entry = { id: event.id, tool: event.tool, kind: event.kind, text: event.text };
  if (event.phase === 'start') return [...list.filter((x) => x.id !== event.id), { ...entry, running: true }];
  const done = { ...entry, running: false, result: event.result, count: event.count, items: event.items, entries: event.entries, pages: event.pages };
  return list.some((x) => x.id === event.id) ? list.map((x) => (x.id === event.id ? done : x)) : [...list, done];
}

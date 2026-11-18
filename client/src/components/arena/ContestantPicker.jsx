import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDown } from '../Icons.jsx';

const PROVIDERS = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral', openai: 'OpenAI', cohere: 'Cohere' };

// A status light: green = ready, amber = at its free usage limit for now, red = the provider refuses it.
export function StatusDot({ entry }) {
  const tone = entry.available === false ? 'bg-bad' : entry.busy ? 'bg-warn' : 'bg-good';
  const label = entry.available === false ? `unavailable: ${entry.note ?? 'refused by the provider'}` : entry.busy ? 'busy right now' : 'ready';
  return <span title={label} aria-label={label} className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

// The rich dropdown for choosing a contestant: levels first, then single models, each with a status light.
// `other` is the id already taken by the opponent (it cannot be picked twice).
export default function ContestantPicker({ arena, value, other, onChange, tone }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = arena.find((c) => c.id === value);
  const groups = [['Levels', arena.filter((c) => c.kind === 'level')], ['Single models', arena.filter((c) => c.kind === 'model')]];
  const accent = tone === 'a' ? 'border-side-a/70 hover:border-side-a' : 'border-side-b/70 hover:border-side-b';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Choose contestant ${tone === 'a' ? 'A' : 'B'}`}
        className={`flex w-full items-center gap-2 rounded-xl border bg-ink-900/80 px-3 py-2 text-left transition ${accent}`}
      >
        {current && <StatusDot entry={current} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-lg leading-tight text-parchment">{current?.name ?? 'Choose…'}</span>
          <span className="block truncate text-[11px] text-parchment/55">{current ? (current.kind === 'level' ? `Level · ${PROVIDERS[current.provider] ?? current.provider}` : current.tagline) : ''}</span>
        </span>
        <ChevronDown width={16} height={16} className={`shrink-0 text-parchment/60 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul role="listbox" aria-label="Contestants" className={`absolute top-full z-50 mt-2 max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto ${tone === 'b' ? 'right-0' : 'left-0'} rounded-xl border border-gold-500/40 bg-ink-800 p-1 text-left shadow-2xl`}>
          {groups.map(([title, list]) => list.length > 0 && (
            <li key={title} role="presentation">
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.25em] text-parchment/45">{title}</p>
              <ul role="presentation">
                {list.map((c) => {
                  const taken = c.id === other;
                  const off = c.available === false;
                  return (
                    <li key={c.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={c.id === value}
                        disabled={off}
                        title={taken ? 'Already the other contestant' : off ? `Unavailable: ${c.note ?? 'the provider refuses it'}` : undefined}
                        onClick={() => {
                          onChange(c.id);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${off ? 'cursor-not-allowed opacity-45' : 'hover:bg-white/5'} ${c.id === value ? 'bg-gold-500/15' : ''}`}
                      >
                        <StatusDot entry={c} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-parchment">{c.name}{taken && <span className="ml-2 text-[10px] text-parchment/45">(swap)</span>}</span>
                          <span className="block truncate text-[11px] text-parchment/50">{off ? `Unavailable: ${c.note ?? 'refused by the provider'}` : c.busy ? 'Busy: at its free usage limit for now' : c.tagline}</span>
                        </span>
                        {c.id === value && <CheckIcon width={16} height={16} className="shrink-0 text-gold-300" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from './Icons.jsx';

const PROVIDERS = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral' };

// Dropdown for choosing the answer level. `children` is what you click (the lotus logo in the input box).
// The list opens upward because the input box sits at the bottom of the screen.
export default function ModelPicker({ tiers, value, onChange, children, label = 'Choose answer level' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click or Escape.
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

  if (!tiers.length) return <div className="shrink-0">{children}</div>; // levels not loaded yet: just show the logo

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="flex items-center gap-1.5 rounded-xl px-1.5 py-1 text-inherit transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-gold-400"
      >
        {children}
      </button>

      {open && (
        <ul role="listbox" aria-label={label} className="absolute bottom-full left-0 z-50 mb-3 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gold-500/40 bg-ink-800 p-1 text-left shadow-2xl">
          {tiers.map((t) => {
            const selected = t.id === value;
            return (
              <li key={t.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(t.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/5 ${selected ? 'bg-gold-500/15' : ''}`}
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-gold-300">{selected && <CheckIcon width={18} height={18} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-lg leading-tight text-parchment">{t.name}</span>
                    <span className="block text-xs text-parchment/60">{t.tagline}</span>
                    {t.model && <span className="mt-0.5 block truncate text-[11px] text-parchment/40">{PROVIDERS[t.provider] ?? t.provider} · {t.model}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

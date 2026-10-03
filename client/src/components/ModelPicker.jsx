import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDown } from './Icons.jsx';

// Dropdown for choosing the answer level. `children` is what you click (the logo, or a small chip).
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

  if (!tiers.length) return <div>{children}</div>; // not loaded yet: just show the logo

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="w-full rounded-xl text-inherit transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
      >
        {children}
      </button>

      {open && (
        <ul role="listbox" aria-label={label} className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gold-500/40 bg-ink-800 p-1 shadow-2xl">
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

// The small "Sutra Lite" label shown under the logo / in the top bar.
export function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold-500/40 bg-ink-900/70 px-2.5 py-0.5 text-xs text-gold-200">
      {tier.name} <ChevronDown width={12} height={12} />
    </span>
  );
}

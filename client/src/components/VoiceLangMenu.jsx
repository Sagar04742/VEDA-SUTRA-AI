import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDown } from './Icons.jsx';
import { VOICE_LANGUAGES } from '../hooks/useSpeech.js';

// The language you speak in, as a small chip right next to the microphone (instead of a stray dropdown).
// The menu opens upwards because the input bar sits at the bottom of the screen.
export default function VoiceLangMenu({ value, onChange }) {
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

  const current = VOICE_LANGUAGES.find((l) => l.code === value) ?? VOICE_LANGUAGES[0];
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Voice language: ${current.label}`}
        title={`Speaking language: ${current.label}. Click to change.`}
        className="flex h-8 items-center gap-0.5 rounded-full border border-white/10 px-2 text-[11px] font-semibold uppercase tracking-wide text-parchment/70 transition hover:border-gold-400/60 hover:text-gold-200"
      >
        {current.code.slice(0, 2)}
        <ChevronDown width={10} height={10} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Voice language" className="absolute bottom-full right-0 z-50 mb-3 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gold-500/40 bg-ink-800 p-1 shadow-2xl">
          <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-widest text-parchment/45">Speak in</li>
          {VOICE_LANGUAGES.map((l) => (
            <li key={l.code} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={l.code === value}
                onClick={() => {
                  onChange(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition hover:bg-white/5 ${l.code === value ? 'bg-gold-500/15 text-gold-200' : 'text-parchment/85'}`}
              >
                <span className="grid h-4 w-4 place-items-center text-gold-300">{l.code === value && <CheckIcon width={14} height={14} />}</span>
                <span className="flex-1">{l.label}</span>
                <span className="text-[10px] uppercase text-parchment/40">{l.code.slice(0, 2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
